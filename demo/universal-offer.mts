// Issues a universal offer (BOLT12 + ssps_rails) from our ldk-server fork, or decodes one.
//   npm run offer -- --network mutinynet --amount 5000 --rails btc:mutinynet,ln:mutinynet
//   npm run offer -- --decode lno1...
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { decodeOffer, encodePaymentCode } from '../packages/universal-code/src/index';

const SSPS_RAILS = 1000000385n;
const names: Record<string, string> = {
  '2': 'offer_chains', '8': 'offer_amount (msat)', '10': 'offer_description',
  '16': 'offer_paths', '22': 'offer_issuer_id', [String(SSPS_RAILS)]: 'ssps_rails',
};

const { values: o } = parseArgs({ options: {
  network: { type: 'string', default: 'mutinynet' }, amount: { type: 'string', default: '5000' },
  rails: { type: 'string' }, description: { type: 'string', default: 'KaleidoPay universal offer' },
  decode: { type: 'string' },
} });

function show(offer: string) {
  console.log(`\n${offer}\n`);
  for (const f of decodeOffer(offer)) {
    const name = names[String(f.type)] ?? `type ${f.type}`;
    let value: string;
    if (f.type === SSPS_RAILS || f.type === 10n) value = new TextDecoder().decode(f.value);
    else if (f.type === 8n) value = f.value.reduce((n, b) => n * 256n + BigInt(b), 0n).toString();
    else value = `${f.value.length} bytes`;
    console.log(`  ${String(f.type).padStart(10)}  ${name.padEnd(20)} ${value}`);
  }
  const rails = decodeOffer(offer).find(f => f.type === SSPS_RAILS);
  console.log(rails
    ? '\nA BOLT12 wallet pays it as a normal offer; an SSPS wallet reads the rails and may pay on another one.'
    : '\nNo ssps_rails record: a plain BOLT12 offer.');
}

if (o.decode) {
  show(o.decode.trim());
  process.exit(0);
}

const network = o.network!;
const rails = (o.rails ?? `btc:${network},ln:${network}`).split(',').map(r => r.trim()).filter(Boolean);
const run = promisify(execFile);
const { stdout } = await run('signet/ldk-node/run.sh', [
  'cli', 'bolt12-receive', o.description!, `${o.amount}sat`, '--ssps-rails', JSON.stringify(rails),
], { env: { ...process.env, NET: network } });
const offer = JSON.parse(stdout).offer as string;
console.log(`Universal offer from our ldk-server on ${network}, ${o.amount} sat, rails ${JSON.stringify(rails)}:`);
show(offer);
console.log(`\nBIP321 form: ${encodePaymentCode({ offer, amountSat: Number(o.amount) }, network as any)}`);
