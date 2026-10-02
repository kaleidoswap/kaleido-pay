import {KALEIDOPAY_DESTINATIONS,decodeDestinations,encodeDestinations,orderedDestinations,type DestinationMetadata} from '../../packages/universal-code/src/destinations';
import {decodeOffer,encodeOffer,validateRails,SSPS_RAILS} from '../../packages/universal-code/src/offer';
const names: Record<string,string> = {'2':'offer_chains','4':'offer_metadata','6':'offer_currency','8':'offer_amount','10':'offer_description','12':'offer_features','14':'offer_absolute_expiry','16':'offer_paths','18':'offer_issuer','20':'offer_quantity_max','22':'offer_issuer_id','1000000385':'ssps_rails','1000000387':'kaleidopay_destinations (experimental)'};
const utf8=(v:Uint8Array)=>new TextDecoder('utf-8',{fatal:true}).decode(v);
const uint=(v:Uint8Array)=>{if(v.length>8||(v.length>0&&v[0]===0))throw Error('Noncanonical TLV integer');return v.reduce((n,b)=>(n<<8n)|BigInt(b),0n)};
export function inspect(input:string) {
 let code=input.trim().replace(/^lightning:(\/\/)?/i,'');
 if(/^bitcoin:/i.test(code)) {
  const query=code.indexOf('?');const params=new URLSearchParams(query<0?'':code.slice(query+1));
  const offers=params.getAll('lno');if(offers.length!==1)throw Error('The BIP321 link must contain exactly one lno offer.');code=offers[0];
 }
 if(!/^lno1/i.test(code))throw Error('Paste an lno1 offer, lightning: link or BIP321 with lno. lni invoices and lnr requests are not supported yet.');
 const fields=decodeOffer(code);if(!fields.length)throw Error('Empty offer');
 const warnings=['Structural decoding only: signatures, reachability and payment validity are not verified.'];
 const text=(type:bigint)=>{const f=fields.find(f=>f.type===type);if(!f)return null;try{return utf8(f.value)}catch{warnings.push(`Invalid UTF-8 in field ${type}`);return null}};
 const currency=text(6n),description=text(10n),issuer=text(18n);
 let amount:string|null=null,rails:string[]|null=null;
 let destinations:DestinationMetadata|null=null;
 const rows=fields.map(f=>{
  const hex=Array.from(f.value,b=>b.toString(16).padStart(2,'0')).join('');let decoded:string|null=null;
  try {
   if([6n,10n,18n].includes(f.type))decoded=utf8(f.value);
   if([8n,14n,20n].includes(f.type))decoded=uint(f.value).toString();
   if(f.type===8n){const n=uint(f.value);amount=currency?`${n} minor units ${currency}`:`${n/1000n}${n%1000n?'.'+(n%1000n).toString().padStart(3,'0').replace(/0+$/,''):''} sats`;}
   if(f.type===KALEIDOPAY_DESTINATIONS){destinations=decodeDestinations(f.value);decoded=JSON.stringify(destinations,null,2);warnings.push('Experimental destinations: network, addresses and server identities need SDK verification. This field is not an SSPS payment lock.');}
   if(f.type===SSPS_RAILS){const value=JSON.parse(utf8(f.value));validateRails(value);rails=value;decoded=JSON.stringify(value,null,2);}
  }catch{warnings.push(`Invalid value in field ${f.type}; the original bytes remain visible.`)}
  if(!names[String(f.type)]&&f.type%2n===0n)warnings.push(`Unknown mandatory field: ${f.type}. A wallet that does not understand it must reject the offer.`);
  return {type:String(f.type),name:names[String(f.type)]??'Unknown field',bytes:f.value.length,hex,decoded,optional:f.type%2n===1n};
 });
 return {description,issuer,amount,currency,rails,destinations,orderedDestinations:destinations?orderedDestinations(destinations):[],metadataPresent:fields.some(f=>f.type===4n),fields:rows,warnings};
}
export const sample=encodeOffer([
 {type:KALEIDOPAY_DESTINATIONS,value:encodeDestinations({version:1,network:"mainnet",destinations:[{type:"arkade",address:"EXAMPLE_ARKADE_NOT_PAYABLE",server:"https://arkade.example/"},{type:"bark",address:"EXAMPLE_BARK_NOT_PAYABLE",server:"https://bark.example/"}]})},
 {type:4n,value:Uint8Array.of(1,2,3,4)},
 {type:8n,value:Uint8Array.of(7,161,32)},
 {type:10n,value:new TextEncoder().encode('KaleidoPay • educational example, not payable')},
 {type:SSPS_RAILS,value:new TextEncoder().encode('["btc:mainnet","ln:mainnet"]')},
]);
