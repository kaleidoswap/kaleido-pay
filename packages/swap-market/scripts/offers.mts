import { discoverOffers } from '../src/index';
const net = (process.argv[2] || 'mainnet') as any;
const offers = await discoverOffers({ network: net, powTarget: 0 });
for (const o of offers.sort((a, b) => a.percentageFee - b.percentageFee))
  console.log(o.pubkey.slice(0, 12), `pow ${o.powBits}`, `fee ${o.percentageFee}%`, `mining ${o.miningFee}`, `min ${o.minAmount}`, `maxRev ${o.maxReverse}`, `maxFwd ${o.maxForward}`);
console.log(`${offers.length} offers on ${net}, ${offers.filter(o => o.powBits >= 30).length} pass PoW 30`);
process.exit(0);
