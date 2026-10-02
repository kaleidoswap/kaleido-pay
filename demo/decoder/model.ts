import {decodeOffer,encodeOffer,encodeRails,offerRails,validateRailEntries,SSPS_RAILS,type OfferRail} from '../../packages/universal-code/src/offer';
import {paymentCodeNetwork} from '../../packages/universal-code/src/uri';
// Public Ark servers' x-only keys, read from each server on 2026-10-02. Servers can rotate keys: a match names the server, a miss proves nothing.
const servers: Record<string,string> = {
 'arkade:8202bebddeb1f7442803897a85eaf3ce9254d07df0172fc3725ab5f0d097779c':'arkade.computer · mainnet',
 'arkade:301078808e4f7bc0dadfe29e34b1df8eaf0108ef06b1722274075ebc107a127a':'mutinynet.arkade.sh · Mutinynet',
 'bark:75b2e4f6abe5b00736359de211c35d9e72b615e5fd424d8ad1e68a8b300b97b5':'ark.second.tech · mainnet',
 'bark:244a5a493e5f0c7b2ff513575715c036100ae219e5765ea688eb542a06f85aed':'ark.signet.2nd.dev · signet',
};
export type InspectedRail = OfferRail & {server?: string};
const names: Record<string,string> = {'2':'offer_chains','4':'offer_metadata','6':'offer_currency','8':'offer_amount','10':'offer_description','12':'offer_features','14':'offer_absolute_expiry','16':'offer_paths','18':'offer_issuer','20':'offer_quantity_max','22':'offer_issuer_id','1000000385':'ssps_rails'};
const utf8=(v:Uint8Array)=>new TextDecoder('utf-8',{fatal:true}).decode(v);
const uint=(v:Uint8Array)=>{if(v.length>8||(v.length>0&&v[0]===0))throw Error('Noncanonical TLV integer');return v.reduce((n,b)=>(n<<8n)|BigInt(b),0n)};
export function inspect(input:string) {
 const link=input.trim().replace(/^lightning:(\/\/)?/i,'');let code=link;
 let onchain:{address:string|null,amountBtc:string|null,label:string|null,message:string|null}|null=null;
 if(/^bitcoin:/i.test(code)) {
  const query=code.indexOf('?');const params=new URLSearchParams(query<0?'':code.slice(query+1));
  const offers=params.getAll('lno');if(offers.length!==1)throw Error('The BIP321 link must contain exactly one lno offer.');code=offers[0];
  const path=link.slice('bitcoin:'.length,query<0?undefined:query);let address:string;try{address=decodeURIComponent(path)}catch{address=path}
  onchain={address:address||null,amountBtc:params.get('amount'),label:params.get('label'),message:params.get('message')};
 }
 if(!/^lno1/i.test(code))throw Error('Paste an lno1 offer, lightning: link or BIP321 with lno. lni invoices and lnr requests are not supported yet.');
 const fields=decodeOffer(code);if(!fields.length)throw Error('Empty offer');
 const warnings=['Structural decoding only: signatures, reachability and payment validity are not verified.'];
 const text=(type:bigint)=>{const f=fields.find(f=>f.type===type);if(!f)return null;try{return utf8(f.value)}catch{warnings.push(`Invalid UTF-8 in field ${type}`);return null}};
 const currency=text(6n),description=text(10n),issuer=text(18n);
 let amount=null as string|null,rails=null as string[]|null;
 let preference:InspectedRail[]=[];
 const rows=fields.map(f=>{
  const hex=Array.from(f.value,b=>b.toString(16).padStart(2,'0')).join('');let decoded:string|null=null;
  try {
   if([6n,10n,18n].includes(f.type))decoded=utf8(f.value);
   if([8n,14n,20n].includes(f.type))decoded=uint(f.value).toString();
   if(f.type===8n){const n=uint(f.value);amount=currency?`${n} minor units ${currency}`:`${n/1000n}${n%1000n?'.'+(n%1000n).toString().padStart(3,'0').replace(/0+$/,''):''} sats`;}
   if(f.type===SSPS_RAILS){const value=JSON.parse(utf8(f.value));validateRailEntries(value);preference=offerRails(code).map(r=>servers[r.rail]?{...r,server:servers[r.rail]}:r);rails=preference.map(r=>r.rail);decoded=JSON.stringify(value,null,2);}
  }catch{warnings.push(`Invalid value in field ${f.type}; the original bytes remain visible.`)}
  if(!names[String(f.type)]&&f.type%2n===0n)warnings.push(`Unknown mandatory field: ${f.type}. A wallet that does not understand it must reject the offer.`);
  return {type:String(f.type),name:names[String(f.type)]??'Unknown field',bytes:f.value.length,hex,decoded,optional:f.type%2n===1n};
 });
 // The btc rail is paid to the BIP321 address, which travels outside the offer.
 if(preference.some(r=>r.rail==='btc'||r.rail.startsWith('btc:'))&&!onchain?.address)warnings.push('The offer lists an on-chain rail, but no Bitcoin address came with it. Paste the full BIP321 link to see where on-chain payments go.');
 let network:string|null=null;try{network=paymentCodeNetwork(code)??null}catch{}
 return {description,issuer,amount,currency,network,onchain,rails,preference,metadataPresent:fields.some(f=>f.type===4n),fields:rows,warnings};
}
/** The shape Rate's Reusable payment QR issues: a reusable (amountless) offer with the receiver's ordered rails,
 * in BIP321 beside the on-chain address. Real public mainnet server keys; every address is a placeholder that cannot be paid. */
export const sampleOffer=encodeOffer([
 {type:4n,value:Uint8Array.of(1,2,3,4)},
 {type:10n,value:new TextEncoder().encode('KaleidoPay • synthetic example, not payable')},
 {type:SSPS_RAILS,value:encodeRails([
  {rail:'arkade:8202bebddeb1f7442803897a85eaf3ce9254d07df0172fc3725ab5f0d097779c',address:'ark1examplearkadenotpayable'},
  {rail:'bark:75b2e4f6abe5b00736359de211c35d9e72b615e5fd424d8ad1e68a8b300b97b5',address:'ark1examplebarknotpayable'},
  'btc:mainnet','ln:mainnet'])},
]);
export const sample=`bitcoin:bc1qexampleaddressnotpayable?lno=${sampleOffer}`;
