import { discoverOffers, reverseQuote, createReverseSwap, DEFAULT_RELAYS } from '../src/index';
const net = (process.argv[2] || 'signet') as any;
const offers = (await discoverOffers({ network: net })).sort((a,b)=>b.powBits-a.powBits);
const dest = net === 'mainnet' ? 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' : 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
for (const o of offers) {
  const ln = reverseQuote(o, 25000);
  if (ln > o.maxReverse || ln < o.minAmount) { console.log(o.pubkey.slice(0,10), 'skip, out of range'); continue; }
  try {
    const s = await createReverseSwap({ offer: o, network: net, lightningSat: ln, destination: dest, relays: DEFAULT_RELAYS });
    console.log(o.pubkey.slice(0,10), 'OK id', s.id, 'lock', s.onchainAmount, 'at', s.lockupAddress, 'timeout', s.timeoutBlockHeight, 'prepay', !!s.minerFeeInvoice);
  } catch (e: any) { console.log(o.pubkey.slice(0,10), 'FAIL', e.message); }
}
process.exit(0);
