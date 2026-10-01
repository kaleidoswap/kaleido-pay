import { generateSecretKey } from 'nostr-tools';
import { decode as decodeBolt11 } from 'light-bolt11-decoder';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, randomBytes } from '@noble/hashes/utils';
import { secp256k1 } from '@noble/curves/secp256k1';
import { requestServer, reverseOnchainAmount } from './nostr';
import { checkReverseScript, buildClaimTx } from './htlc';
import { Esplora, ESPLORA } from './esplora';
import type { LightningPayer, ReverseSwap, SwapNetwork, SwapOffer } from './types';

/** Blocks we need between now and the timeout to get the claim confirmed (Electrum's MIN_LOCKTIME_DELTA). */
const MIN_LOCKTIME_DELTA = 60;

function bolt11(inv: string): { hash: string; sat: number } {
  const d = decodeBolt11(inv);
  const get = (name: string) => (d.sections as any[]).find(s => s.name === name)?.value;
  const msat = Number(get('amount'));
  if (!get('payment_hash') || !msat) throw new Error('swap invoice has no hash or amount');
  return { hash: String(get('payment_hash')), sat: Math.floor(msat / 1000) };
}

/** Asks `offer` for a reverse swap of `lightningSat` and checks every term it returns. */
export async function createReverseSwap(p: {
  offer: SwapOffer;
  network: SwapNetwork;
  lightningSat: number;
  destination: string;
  relays?: string[];
  esplora?: Esplora;
}): Promise<ReverseSwap> {
  const { offer } = p;
  const preimage = randomBytes(32);
  const paymentHash = bytesToHex(sha256(preimage));
  const claimPriv = secp256k1.utils.randomPrivateKey();
  const claimPubkey = bytesToHex(secp256k1.getPublicKey(claimPriv, true));
  const relays = [...new Set([...(offer.relays.length ? offer.relays : []), ...(p.relays ?? [])])];

  const r = await requestServer({
    server: offer.pubkey,
    relays,
    secretKey: generateSecretKey(),
    method: 'createswap',
    data: {
      type: 'reversesubmarine',
      pairId: 'BTC/BTC',
      invoiceAmount: p.lightningSat,
      preimageHash: paymentHash,
      claimPublicKey: claimPubkey,
    },
  });

  for (const k of ['id', 'invoice', 'lockupAddress', 'redeemScript']) if (typeof r[k] !== 'string') throw new Error(`swap reply lacks ${k}`);
  for (const k of ['timeoutBlockHeight', 'onchainAmount']) if (!Number.isInteger(r[k])) throw new Error(`swap reply lacks ${k}`);

  checkReverseScript({
    redeemScript: r.redeemScript,
    lockupAddress: r.lockupAddress,
    paymentHash,
    claimPubkey,
    timeoutBlockHeight: r.timeoutBlockHeight,
    network: p.network,
  });

  const main = bolt11(r.invoice);
  if (main.hash !== paymentHash) throw new Error('swap invoice is for another payment hash');
  let total = main.sat;
  if (r.minerFeeInvoice) {
    const fee = bolt11(r.minerFeeInvoice);
    if (fee.sat > offer.miningFee * 2) throw new Error('prepayment is larger than the offer announced');
    total += fee.sat;
  }
  if (total !== p.lightningSat) throw new Error(`swap invoices total ${total} sat, asked for ${p.lightningSat}`);
  const expected = reverseOnchainAmount(offer, p.lightningSat);
  if (r.onchainAmount < expected) throw new Error(`server locks ${r.onchainAmount} sat, offer promised ${expected}`);

  const esplora = p.esplora ?? new Esplora(ESPLORA[p.network]);
  if (r.timeoutBlockHeight - await esplora.tipHeight() <= MIN_LOCKTIME_DELTA) throw new Error('swap timeout too close');

  return {
    id: r.id,
    network: p.network,
    server: offer.pubkey,
    serverRelays: relays,
    preimage: bytesToHex(preimage),
    paymentHash,
    claimPrivkey: bytesToHex(claimPriv),
    claimPubkey,
    redeemScript: r.redeemScript,
    lockupAddress: r.lockupAddress,
    timeoutBlockHeight: r.timeoutBlockHeight,
    onchainAmount: r.onchainAmount,
    invoice: r.invoice,
    minerFeeInvoice: r.minerFeeInvoice,
    invoiceAmount: p.lightningSat,
    destination: p.destination,
  };
}

export type ReverseStage =
  | { stage: 'paying' }
  | { stage: 'waiting_lockup' }
  | { stage: 'lockup_seen'; txid: string; confirmed: boolean }
  | { stage: 'claimed'; txid: string; fee: number };

export type Lockup = { txid: string; vout: number; confirmed: boolean };

/** Polls until the server's lockup appears (and confirms, unless `zeroConf`). */
export async function waitForLockup(p: {
  swap: Pick<ReverseSwap, 'lockupAddress' | 'onchainAmount'>;
  esplora: Esplora;
  zeroConf?: boolean;
  pollMs?: number;
  timeoutMs?: number;
  onSeen?: (l: Lockup) => void;
  abort?: () => unknown;
}): Promise<Lockup> {
  const deadline = Date.now() + (p.timeoutMs ?? 60 * 60 * 1000);
  let announced = false;
  while (Date.now() < deadline) {
    const err = p.abort?.();
    if (err) throw err;
    const seen = await p.esplora.findOutput(p.swap.lockupAddress, p.swap.onchainAmount).catch(() => null);
    if (seen && !announced) { p.onSeen?.(seen); announced = true; }
    if (seen && (seen.confirmed || p.zeroConf)) return seen;
    await new Promise(r => setTimeout(r, p.pollMs ?? 10000));
  }
  throw new Error('server never locked the swap on-chain');
}

/** Builds and broadcasts the claim of `lockup` to the swap's destination. */
export async function claimLockup(p: {
  swap: Pick<ReverseSwap, 'onchainAmount' | 'redeemScript' | 'preimage' | 'claimPrivkey' | 'destination' | 'network'>;
  lockup: Lockup;
  esplora: Esplora;
  feeRate?: number;
}): Promise<{ txid: string; fee: number; hex: string }> {
  const claim = buildClaimTx({
    txid: p.lockup.txid,
    vout: p.lockup.vout,
    amount: p.swap.onchainAmount,
    redeemScript: p.swap.redeemScript,
    preimage: p.swap.preimage,
    claimPrivkey: p.swap.claimPrivkey,
    destination: p.swap.destination,
    feeRate: p.feeRate ?? await p.esplora.feeRate(),
    network: p.swap.network,
  });
  await p.esplora.broadcast(claim.hex);
  return claim;
}

export function swapInvoices(swap: Pick<ReverseSwap, 'invoice' | 'minerFeeInvoice'>): string[] {
  return swap.minerFeeInvoice ? [swap.invoice, swap.minerFeeInvoice] : [swap.invoice];
}

/** Pays the swap, waits for the server's lockup, and claims it to the destination. */
export async function completeReverseSwap(p: {
  swap: ReverseSwap;
  payer: LightningPayer;
  onStage?: (s: ReverseStage) => void;
  zeroConf?: boolean;
  pollMs?: number;
  timeoutMs?: number;
  esplora?: Esplora;
}): Promise<{ txid: string; fee: number }> {
  const { swap } = p;
  const esplora = p.esplora ?? new Esplora(ESPLORA[swap.network]);
  const say = p.onStage ?? (() => {});
  say({ stage: 'paying' });
  // The main payment stays pending until our claim reveals the preimage, so don't await it here.
  let payError: unknown = null;
  p.payer.payInvoices(swapInvoices(swap)).catch(e => { payError = e; });
  say({ stage: 'waiting_lockup' });
  const lockup = await waitForLockup({
    swap, esplora, zeroConf: p.zeroConf, pollMs: p.pollMs, timeoutMs: p.timeoutMs,
    onSeen: l => say({ stage: 'lockup_seen', txid: l.txid, confirmed: l.confirmed }),
    abort: () => payError,
  });
  const claim = await claimLockup({ swap, lockup, esplora });
  say({ stage: 'claimed', txid: claim.txid, fee: claim.fee });
  return { txid: claim.txid, fee: claim.fee };
}
