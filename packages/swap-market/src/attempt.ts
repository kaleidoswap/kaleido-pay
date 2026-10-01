import { createReverseSwap, waitForLockup, swapInvoices } from './reverse';
import { buildClaimTx } from './htlc';
import { Esplora, ESPLORA } from './esplora';
import type { SwapQuote } from './quote';
import type { LightningPayer, ReverseSwap, SwapOffer } from './types';

export type AttemptStage =
  | 'created'        // swap agreed with the provider, secrets saved, nothing paid
  | 'paying'         // invoices sent; the main one stays pending until we claim
  | 'waiting_lockup'
  | 'lockup_seen'
  | 'claiming'       // claim built and saved, broadcast in progress
  | 'claimed'
  | 'failed';

/** Everything about a payment except its secrets. Safe to persist in plain storage. */
export interface SwapAttempt {
  id: string;
  requestId?: string;
  stage: AttemptStage;
  quote: SwapQuote;
  swap: Omit<ReverseSwap, 'preimage' | 'claimPrivkey'>;
  lockup?: { txid: string; vout: number; confirmed: boolean };
  claim?: { txid: string; hex: string; fee: number };
  error?: string;
  updatedAt: number;
}

export interface AttemptStore {
  save(a: SwapAttempt): Promise<void>;
  load(id: string): Promise<SwapAttempt | null>;
  list(): Promise<SwapAttempt[]>;
}

/** Secure storage for the preimage and claim key (Keychain / SecureStore in the wallet). */
export interface SecretStore {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
}

export interface AttemptDeps {
  attempts: AttemptStore;
  secrets: SecretStore;
  esplora?: Esplora;
  onUpdate?: (a: SwapAttempt) => void;
  zeroConf?: boolean;
  pollMs?: number;
  timeoutMs?: number;
  createSwap?: typeof createReverseSwap;
}

const secretKey = (id: string) => `kaleidopay.swap.${id}`;

async function update(deps: AttemptDeps, a: SwapAttempt, patch: Partial<SwapAttempt>): Promise<SwapAttempt> {
  Object.assign(a, patch, { updatedAt: Date.now() });
  await deps.attempts.save(a);
  deps.onUpdate?.({ ...a });
  return a;
}

/** Agrees the swap with the provider and persists it before anything is paid. */
export async function startAttempt(p: {
  quote: SwapQuote;
  offer: SwapOffer;
  destination: string;
  requestId?: string;
  relays?: string[];
}, deps: AttemptDeps): Promise<SwapAttempt> {
  if (p.quote.expiresAt < Date.now() / 1000) throw new Error('quote expired, requote');
  if (p.offer.pubkey !== p.quote.provider) throw new Error('quote is for another provider');
  const esplora = deps.esplora ?? new Esplora(ESPLORA[p.quote.network]);
  const swap = await (deps.createSwap ?? createReverseSwap)({
    offer: p.offer, network: p.quote.network, lightningSat: p.quote.payerSat, destination: p.destination, relays: p.relays, esplora,
  });
  await deps.secrets.put(secretKey(swap.id), JSON.stringify({ preimage: swap.preimage, claimPrivkey: swap.claimPrivkey }));
  const { preimage, claimPrivkey, ...pub } = swap;
  const a: SwapAttempt = { id: swap.id, requestId: p.requestId, stage: 'created', quote: p.quote, swap: pub, updatedAt: Date.now() };
  await deps.attempts.save(a);
  deps.onUpdate?.({ ...a });
  return a;
}

/** Pays a created attempt, then waits for the lockup and claims it. */
export async function payAttempt(a: SwapAttempt, payer: LightningPayer, deps: AttemptDeps): Promise<SwapAttempt> {
  if (a.stage !== 'created') throw new Error(`attempt already ${a.stage}; use resumeAttempt`);
  await update(deps, a, { stage: 'paying' });
  let payError: unknown = null;
  payer.payInvoices(swapInvoices(a.swap)).catch(e => { payError = e; });
  return finish(a, deps, () => payError);
}

/** Continues an attempt after a restart. Never pays again. */
export async function resumeAttempt(a: SwapAttempt, deps: AttemptDeps): Promise<SwapAttempt> {
  if (a.stage === 'claimed' || a.stage === 'failed') return a;
  if (a.stage === 'created') return update(deps, a, { stage: 'failed', error: 'never paid' });
  return finish(a, deps);
}

async function finish(a: SwapAttempt, deps: AttemptDeps, abort?: () => unknown): Promise<SwapAttempt> {
  const esplora = deps.esplora ?? new Esplora(ESPLORA[a.swap.network]);
  try {
    if (a.claim) {
      await esplora.broadcast(a.claim.hex).catch(e => {
        if (!/already|known|missing|spent|conflict/i.test(String(e?.message))) throw e;
      });
      return update(deps, a, { stage: 'claimed', error: undefined });
    }
    const raw = await deps.secrets.get(secretKey(a.id));
    if (!raw) throw new Error('swap secrets missing from secure storage');
    const { preimage, claimPrivkey } = JSON.parse(raw);
    if (a.stage === 'paying') await update(deps, a, { stage: 'waiting_lockup' });
    const lockup = a.lockup?.confirmed || (a.lockup && deps.zeroConf) ? a.lockup : await waitForLockup({
      swap: a.swap, esplora, zeroConf: deps.zeroConf, pollMs: deps.pollMs, timeoutMs: deps.timeoutMs, abort,
      onSeen: l => { update(deps, a, { stage: 'lockup_seen', lockup: l }); },
    });
    const built = buildClaimTx({
      txid: lockup.txid, vout: lockup.vout, amount: a.swap.onchainAmount, redeemScript: a.swap.redeemScript,
      preimage, claimPrivkey, destination: a.swap.destination, feeRate: await esplora.feeRate(), network: a.swap.network,
    });
    // Saved before broadcast: once the preimage is public the claim must survive a crash.
    await update(deps, a, { stage: 'claiming', lockup, claim: built });
    await esplora.broadcast(built.hex);
    return update(deps, a, { stage: 'claimed' });
  } catch (e: any) {
    const error = String(e?.message ?? e);
    // With a claim built, keep retrying on resume; the lockup is ours until its timeout.
    return update(deps, a, a.claim ? { stage: 'claiming', error } : { stage: 'failed', error });
  }
}
