// Read-only catalogue check and offline preparation. Never POSTs or pays.
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { ARKADE_PAIR, buildOfferRequest, inspectCreateResponse } from './bolt12-arkade-preflight';
const { values:v } = parseArgs({options:{offer:{type:'string'},amount:{type:'string'},'refund-pubkey':{type:'string'},response:{type:'string'},catalogue:{type:'boolean'},help:{type:'boolean'}}});
if (v.help) console.log('npx tsx demo/bolt12-arkade-preflight.mts --catalogue\nOr: --offer <lno1...> --amount <sats> --refund-pubkey <compressed key> [--response <JSON file>]\nNo POST, wallet access, signing or funding.');
else if (v.catalogue) {
  const r = await fetch('https://maker.signet.kaleidoswap.com/v2/swap/submarine',{signal:AbortSignal.timeout(12000)});
  if (!r.ok) throw new Error(`Catalogue HTTP ${r.status}`);
  const pair = (await r.json())?.ARKD?.BTC;
  console.log(JSON.stringify({verdict:pair?.pairId === ARKADE_PAIR ? 'arkade_pair_advertised':'arkade_pair_not_advertised',offerSupport:'not established by catalogue',settlement:'not tested',pairId:pair?.pairId,limits:pair?.limits,fees:pair?.fees},null,2));
} else {
  if (!v.offer || !v.amount || !v['refund-pubkey'] || !/^[1-9]\d*$/.test(v.amount)) throw new Error('Supply --offer, integer --amount and --refund-pubkey; see --help');
  const request = buildOfferRequest(v.offer,Number(v.amount),v['refund-pubkey']);
  console.log(JSON.stringify({method:'POST',path:'/v2/swap/submarine',submitted:false,request},null,2));
  if (v.response) console.log(JSON.stringify(inspectCreateResponse(JSON.parse(await readFile(v.response,'utf8')),request.invoiceAmount),null,2));
}
