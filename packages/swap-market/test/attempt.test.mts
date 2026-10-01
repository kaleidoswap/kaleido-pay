import assert from 'node:assert/strict';
import { Transaction } from '@scure/btc-signer';
import { hexToBytes } from '@noble/hashes/utils';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { bytesToHex } from '@noble/hashes/utils';
import { quoteReverse, bestReverseQuote, startAttempt, payAttempt, resumeAttempt, claimFee } from '../src/index';
import type { SwapOffer, ReverseSwap, SwapAttempt } from '../src/index';

const offer: SwapOffer = { pubkey: 'aa'.repeat(32), percentageFee: 0.4, miningFee: 630, minAmount: 20000, maxForward: 1e6, maxReverse: 1e7, relays: [], powBits: 31, createdAt: 0 };

// quotes
const q = quoteReverse(offer, 'mainnet', 25000, 3)!;
assert.equal(q.recipientSat, q.onchainSat - claimFee(3));
assert.ok(q.recipientSat >= 25000 && q.recipientSat <= 25002, `recipient ${q.recipientSat}`);
assert.equal(q.payerSat, q.onchainSat + q.fees.provider + q.fees.lockupMining);
assert.equal(quoteReverse(offer, 'mainnet', 5000, 3), null, 'below provider minimum');
const cheap = { ...offer, pubkey: 'bb'.repeat(32), percentageFee: 0.2 };
assert.equal(bestReverseQuote([offer, cheap], 'mainnet', 25000, 3)!.provider, cheap.pubkey);

// a swap with a real script, so the claim actually builds
const priv = secp256k1.utils.randomPrivateKey();
const pub = secp256k1.getPublicKey(priv, true);
const preimage = new Uint8Array(32).fill(9);
const refund = secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey(), true);
const lt = 969533;
const script = new Uint8Array([0x82, 0x01, 0x20, 0x87, 0x63, 0xa9, 0x14, ...ripemd160(sha256(preimage)), 0x88, 0x21, ...pub, 0x67, 0x75, 0x03, lt & 255, (lt >> 8) & 255, lt >> 16, 0xb1, 0x75, 0x21, ...refund, 0x68, 0xac]);
const fakeSwap: ReverseSwap = {
  id: 'swap1', network: 'mainnet', server: offer.pubkey, serverRelays: [], preimage: bytesToHex(preimage), paymentHash: bytesToHex(sha256(preimage)),
  claimPrivkey: bytesToHex(priv), claimPubkey: bytesToHex(pub), redeemScript: bytesToHex(script), lockupAddress: 'bc1qlockup',
  timeoutBlockHeight: lt, onchainAmount: q.onchainSat, invoice: 'lnbc-main', minerFeeInvoice: 'lnbc-prepay', invoiceAmount: q.payerSat,
  destination: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
};

const saved = new Map<string, SwapAttempt>(); const secrets = new Map<string, string>(); const log: string[] = [];
let paid = false; let failBroadcast = true; const broadcasts: string[] = [];
const esplora: any = {
  async findOutput() { return paid ? { txid: 'cd'.repeat(32), vout: 0, confirmed: true } : null; },
  async hasTransaction() { return false; },
  async feeRate() { return 3; },
  async tipHeight() { return lt - 100; },
  async broadcast(hex: string) { broadcasts.push(hex); if (failBroadcast) { failBroadcast = false; throw new Error('network down'); } return Transaction.fromRaw(hexToBytes(hex)).id; },
};
const deps = {
  attempts: { async save(a: SwapAttempt) { saved.set(a.id, JSON.parse(JSON.stringify(a))); }, async load(id: string) { return saved.get(id) ?? null; }, async list() { return [...saved.values()]; } },
  secrets: { async put(k: string, v: string) { secrets.set(k, v); }, async get(k: string) { return secrets.get(k) ?? null; } },
  esplora, pollMs: 1, timeoutMs: 2000,
  onUpdate: (a: SwapAttempt) => log.push(a.stage),
  createSwap: async () => fakeSwap,
};
const payer = {
  async payInvoices(inv: string[]) {
    assert.deepEqual(inv, ['lnbc-main', 'lnbc-prepay']);
    assert.ok(secrets.size === 1 && saved.get('swap1')!.stage === 'paying', 'secrets and attempt saved before paying');
    paid = true;
    return new Promise<void>(() => {}); // main payment stays pending
  },
};

const a = await startAttempt({ quote: q, offer, destination: fakeSwap.destination }, deps);
assert.equal(a.stage, 'created');
assert.ok(!JSON.stringify(saved.get('swap1')).includes(fakeSwap.claimPrivkey), 'claim key never in plain storage');
assert.ok(!JSON.stringify(saved.get('swap1')).includes(fakeSwap.preimage), 'preimage never in plain storage');

const afterCrash = await payAttempt(a, payer, deps);
assert.equal(afterCrash.stage, 'claiming', 'broadcast failure keeps the built claim');
assert.ok(saved.get('swap1')!.claim?.hex, 'claim saved');

const resumed = await resumeAttempt(saved.get('swap1')!, deps);
assert.equal(resumed.stage, 'claimed');
assert.equal(broadcasts.length, 2);
assert.equal(broadcasts[0], broadcasts[1], 'resume rebroadcasts the same claim');
assert.deepEqual(log.filter((s, i) => s !== log[i - 1]), ['created', 'paying', 'waiting_lockup', 'lockup_seen', 'claiming', 'claimed']);

const never = await resumeAttempt({ ...a, stage: 'created' }, deps);
assert.equal(never.stage, 'failed', 'an unpaid attempt is never paid on resume');
console.log('attempt tests passed');

// An unrelated spent/conflicting output is never proof our claim succeeded.
const conflictDeps = { ...deps, esplora: { ...esplora, async broadcast() { throw new Error('inputs spent or conflict'); } } as any };
const conflict = await resumeAttempt({ ...resumed, stage: 'claiming' }, conflictDeps);
assert.equal(conflict.stage, 'claiming');
const observed = await resumeAttempt(conflict, { ...conflictDeps, esplora: { ...conflictDeps.esplora, async hasTransaction(txid: string) { return txid === conflict.claim!.txid; } } });
assert.equal(observed.stage, 'claimed');

// A monitoring interruption must remain recoverable without another payment.
const waiting = { ...a, stage: 'waiting_lockup', claim: undefined, lockup: undefined } as SwapAttempt;
const interrupted = await resumeAttempt(waiting, { ...deps, timeoutMs: 0 });
assert.equal(interrupted.stage, 'recoverable');
const recovered = await resumeAttempt(interrupted, deps);
assert.equal(recovered.stage, 'claimed');
console.log('recovery regression tests passed');
