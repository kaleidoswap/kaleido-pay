import test from 'node:test';import assert from 'node:assert/strict';
import {inspect,sample} from './model';import {encodeOffer} from '../../packages/universal-code/src/offer';
test('decodes metadata, exact amounts and custom rails from offer and URI',()=>{
 const r=inspect(sample);assert.equal(r.amount,'500 sats');assert.deepEqual(r.rails,['bark:'+'b'.repeat(64),'arkade:'+'a'.repeat(64),'btc:mainnet','ln']);assert.equal(r.metadataPresent,true);
 assert.deepEqual(inspect('lightning:'+sample.toUpperCase()),r);
 assert.deepEqual(inspect('bitcoin:?lno='+sample),r);
});
test('keeps unknown bytes and malformed extension values visible',()=>{
 const r=inspect(encodeOffer([{type:24n,value:Uint8Array.of(255)},{type:1000000385n,value:new TextEncoder().encode('broken JSON')}]));
 assert.equal(r.fields[0].hex,'ff');assert.equal(r.fields[1].decoded,null);assert.equal(r.warnings.length,3);
});
test('rejects invalid input, duplicate URI offers and non-offer messages',()=>{
 for(const code of ['lni1qq','bad','lno1','bitcoin:?lno='+sample+'&lno='+sample])assert.throws(()=>inspect(code));
});
test('displays receiver order with Ark addresses and implicit LN fallback',()=>{
 const report=inspect(sample);
 assert.deepEqual(report.preference.map(r=>r.rail.split(':')[0]),['bark','arkade','btc','ln']);
 assert.equal(report.preference[0].address,'examplebarknotpayable');
 const broken=inspect(encodeOffer([{type:1000000385n,value:new TextEncoder().encode('[{"rail":"bark:zz"}]')}]));
 assert.deepEqual(broken.preference,[]);
 assert.ok(broken.warnings.some(w=>w.includes('Invalid value')));
});
