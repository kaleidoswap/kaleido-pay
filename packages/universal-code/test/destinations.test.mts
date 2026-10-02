import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeOffer, decodeOffer, SSPS_RAILS, acceptedRails, withDestinations, offerDestinations, orderedDestinations, encodeDestinations, decodeDestinations, planPayment, type DestinationMetadata } from '../src/index';
const metadata: DestinationMetadata = {version:1,network:'mainnet',destinations:[
  {type:'arkade',address:'same-address',server:'https://ark.example/'},
  {type:'bark',address:'same-address',server:'https://ark.example/'},
]};
const base = encodeOffer([{type:4n,value:Uint8Array.of(1,2,3)}, {type:SSPS_RAILS,value:new TextEncoder().encode('["btc:mainnet"]')}]);
test('ordered metadata preserves issuer bytes and SSPS without confusing Bark and Arkade',()=>{
 const offer=withDestinations(base,metadata);
 assert.deepEqual(offerDestinations(offer,'mainnet'),metadata);
 assert.deepEqual(decodeOffer(offer).find(f=>f.type===4n)?.value,Uint8Array.of(1,2,3));
 assert.deepEqual(acceptedRails(offer),['btc:mainnet','ln']);
 assert.deepEqual(orderedDestinations(metadata).map(d=>d.type),['arkade','bark','lightning']);
 assert.equal(offerDestinations(base,'mainnet'),undefined);
 assert.throws(()=>offerDestinations(offer,'signet'),/network/);
 const explicit={...metadata,destinations:[{type:'lightning',source:'bolt12_offer'},...metadata.destinations]} as DestinationMetadata;
 assert.deepEqual(orderedDestinations(explicit).map(d=>d.type),['lightning','arkade','bark']);
});
test('strict versioned decoding rejects ambiguity and malformed destination data',()=>{
 const bytes=encodeDestinations(metadata);
 assert.deepEqual(decodeDestinations(bytes),metadata);
 for(const value of [
  {...metadata,version:2}, {...metadata,network:'regtest'},
  {...metadata,destinations:[]}, {...metadata,destinations:[metadata.destinations[0],metadata.destinations[0]]},
  {...metadata,destinations:[{...metadata.destinations[0],network:'signet'}]},
  {...metadata,destinations:[{...metadata.destinations[0],server:'https://user:pass@ark.example/'}]},
  {...metadata,destinations:[{...metadata.destinations[0],address:'has spaces'}]},
  {...metadata,destinations:[{type:'lightning',source:'another_offer'}]},
 ]) assert.throws(()=>encodeDestinations(value as DestinationMetadata));
 assert.throws(()=>decodeDestinations(new TextEncoder().encode(new TextDecoder().decode(bytes).replace('"version":1','"version":2,"version":1'))),/Noncanonical/);
 assert.throws(()=>decodeDestinations(Uint8Array.of(255)));
 assert.throws(()=>decodeDestinations(new Uint8Array(8193)),/large/);
});
test('recipient-first prefers an explicit swap to first rail, legacy remains direct-first',()=>{
 const request={id:'test',network:'mainnet' as const,amountSat:500,acceptedRails:['btc:mainnet','ln']};
 const sources=[{id:'ln-wallet',network:'mainnet' as const,rail:'ln'}];
 const swaps=[{id:'electrum',network:'mainnet' as const,from:'ln',to:'btc:mainnet'}];
 const legacy=planPayment(request,sources,swaps);
 const preferred=planPayment({...request,preference:'recipient-first'},sources,swaps);
 assert.equal(legacy.status==='ready'&&legacy.route.kind,'direct');
 assert.equal(preferred.status==='ready'&&preferred.route.kind,'swap');
 const fallback=planPayment({...request,preference:'recipient-first'},sources);
 assert.equal(fallback.status==='ready'&&fallback.route.to,'ln:mainnet');
 assert.equal(planPayment(request,[{...sources[0],network:'signet'}],swaps).status,'unsupported');
});
