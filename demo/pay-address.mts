// Pays a bitcoin address from Lightning through the cheapest Electrum swap provider on Nostr.
//   npm run pay -- --to <address> --amount 25000 [--network mainnet] [--dry-run] [--zero-conf]
//   npm run pay -- --resume <attempt id>
// Payment is manual: the script prints both invoices; pay them from any Lightning wallet.
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import {
  discoverOffers, rankedReverseQuotes, startAttempt, payAttempt, resumeAttempt, Esplora, ESPLORA,
} from '../packages/swap-market/src/index';
import type { SwapAttempt, SwapNetwork } from '../packages/swap-market/src/index';
import { FileAttemptStore, FileSecretStore } from '../packages/swap-market/src/node';

const { values: o } = parseArgs({ options: {
  to: { type: 'string' }, amount: { type: 'string' }, network: { type: 'string', default: 'mainnet' },
  'dry-run': { type: 'boolean' }, 'zero-conf': { type: 'boolean' }, resume: { type: 'string' }, yes: { type: 'boolean' },
} });
const network = o.network as SwapNetwork;
const t0 = Date.now();
const stamp = () => `[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`;
const sats = (n: number) => n.toLocaleString('en-US') + ' sat';
const deps = {
  attempts: new FileAttemptStore('demo/.attempts'),
  secrets: new FileSecretStore('demo/.attempts/secrets.json'),
  esplora: new Esplora(ESPLORA[network]),
  zeroConf: !!o['zero-conf'],
  onUpdate: (a: SwapAttempt) => console.log(stamp(), a.stage.padEnd(15),
    a.lockup ? `lockup ${a.lockup.txid}${a.lockup.confirmed ? '' : ' (unconfirmed)'}` : '',
    a.claim ? `claim ${a.claim.txid}` : '', a.error ?? ''),
};

if (o.resume) {
  const a = await deps.attempts.load(o.resume);
  if (!a) throw new Error(`no attempt ${o.resume}`);
  const done = await resumeAttempt(a, deps);
  console.log(done.stage === 'claimed' ? `Paid. ${mempool(done)}` : `Stopped at ${done.stage}: ${done.error ?? ''}`);
  process.exit(done.stage === 'claimed' ? 0 : 1);
}

if (!o.to || !o.amount) { console.error('usage: --to <address> --amount <sats> [--network mainnet|signet]'); process.exit(2); }
const amount = Number(o.amount);

console.log(stamp(), `looking for swap providers on Nostr (${network})`);
const offers = await discoverOffers({ network });
const feeRate = await deps.esplora.feeRate();
const quotes = rankedReverseQuotes(offers, network, amount, feeRate);
let quote = quotes[0];
if (!quote) { console.error(`${offers.length} providers found, none can take ${sats(amount)}`); process.exit(1); }
console.log(stamp(), `${offers.length} providers, ${quotes.length} can take it, cheapest ${quote.provider.slice(0, 12)}`);
console.log(`
  receiver gets   ${sats(quote.recipientSat)}  at ${o.to}
  you pay         ${sats(quote.payerSat)}  over Lightning
  fees            provider ${sats(quote.fees.provider)} · lockup mining ${sats(quote.fees.lockupMining)} · claim ~${sats(quote.fees.claimMining)} at ${feeRate} sat/vB
`);
if (o['dry-run']) process.exit(0);

const rl = createInterface({ input: process.stdin, output: process.stdout });
if (network === 'mainnet' && !o.yes) {
  const ok = await rl.question(`Real money on mainnet: pay ${sats(quote.payerSat)}? Type yes: `);
  if (ok.trim() !== 'yes') process.exit(1);
}

let attempt: SwapAttempt | null = null;
for (const q of quotes.slice(0, 4)) {
  try {
    console.log(stamp(), `asking ${q.provider.slice(0, 12)} for a swap of ${sats(q.payerSat)}`);
    attempt = await startAttempt({ quote: q, offer: offers.find(x => x.pubkey === q.provider)!, destination: o.to }, deps);
    quote = q;
    break;
  } catch (e: any) { console.log(stamp(), `  ${e.message}`); }
}
if (!attempt) { console.error('no provider agreed to the swap'); process.exit(1); }
if (attempt.quote.payerSat !== quotes[0].payerSat) console.log(stamp(), `using a pricier provider: you pay ${sats(quote.payerSat)}`);
console.log(`\nattempt ${attempt.id} saved; resume with: npm run pay -- --network ${network} --resume ${attempt.id}\n`);
const manualPayer = {
  async payInvoices(invoices: string[]) {
    console.log('Pay BOTH invoices from any Lightning wallet (the first stays pending until the claim):\n');
    invoices.forEach((inv, i) => console.log(`${i === 0 ? 'main' : 'prepayment'}:\n${inv}\n`));
    rl.close();
    return new Promise<void>(() => {});
  },
};
const done = await payAttempt(attempt, manualPayer, deps);
console.log(done.stage === 'claimed' ? `\nPaid. ${mempool(done)}` : `\nStopped at ${done.stage}: ${done.error ?? ''}`);
process.exit(done.stage === 'claimed' ? 0 : 1);

function mempool(a: SwapAttempt) {
  const base = { mainnet: 'https://mempool.space', signet: 'https://mempool.space/signet', testnet: 'https://mempool.space/testnet4', mutinynet: 'https://mutinynet.com' }[a.swap.network];
  return `Claim: ${base}/tx/${a.claim?.txid}`;
}
