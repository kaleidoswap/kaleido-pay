// End-to-end swap on a test network against a chosen provider, paid by our ldk-server.
//   npx tsx signet/first-swap.mts <provider pubkey prefix> <recipient sats> [network]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverOffers, rankedReverseQuotes, startAttempt, payAttempt, Esplora, ESPLORA } from '../packages/swap-market/src/index';
import type { SwapAttempt, SwapNetwork } from '../packages/swap-market/src/index';
import { FileAttemptStore, FileSecretStore } from '../packages/swap-market/src/node';

const run = promisify(execFile);
const [prefix, amountArg, netArg] = process.argv.slice(2);
const network = (netArg ?? 'mutinynet') as SwapNetwork;
const cli = (...args: string[]) => run('signet/ldk-node/run.sh', ['cli', ...args], { env: { ...process.env, NET: network } });
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);

const destination = JSON.parse((await cli('onchain-receive')).stdout).address;
const offers = await discoverOffers({ network });
const offer = offers.find(o => o.pubkey.startsWith(prefix));
if (!offer) throw new Error(`provider ${prefix} not found among ${offers.map(o => o.pubkey.slice(0, 12))}`);
const esplora = new Esplora(ESPLORA[network]);
const quote = rankedReverseQuotes([offer], network, Number(amountArg), await esplora.feeRate())[0];
if (!quote) throw new Error('provider cannot take this amount');
log(`provider ${offer.pubkey.slice(0, 12)}: pay ${quote.payerSat} sat over Lightning, ${quote.recipientSat} sat to ${destination}`);

const deps = {
  attempts: new FileAttemptStore('signet/.attempts'),
  secrets: new FileSecretStore('signet/.attempts/secrets.json'),
  esplora, zeroConf: false, pollMs: 5000,
  onUpdate: (a: SwapAttempt) => log(a.stage.padEnd(15), a.lockup ? `lockup ${a.lockup.txid}` : '', a.claim ? `claim ${a.claim.txid}` : '', a.error ?? ''),
};
const attempt = await startAttempt({ quote, offer, destination }, deps);
const payer = {
  async payInvoices(invoices: string[]) {
    await Promise.all(invoices.map(inv => cli('bolt11-send', inv).then(r => log('sent', r.stdout.replace(/\s+/g, ' ').trim()))));
  },
};
const done = await payAttempt(attempt, payer, deps);
log(done.stage === 'claimed' ? `DONE: claim ${done.claim?.txid}` : `stopped at ${done.stage}: ${done.error}`);
process.exit(done.stage === 'claimed' ? 0 : 1);
