import test from 'node:test';import assert from 'node:assert/strict';
import {inspect,sample,sampleOffer} from './model';import {encodeOffer} from '../../packages/universal-code/src/offer';
const ARKADE='arkade:8202bebddeb1f7442803897a85eaf3ce9254d07df0172fc3725ab5f0d097779c',BARK='bark:75b2e4f6abe5b00736359de211c35d9e72b615e5fd424d8ad1e68a8b300b97b5';
test('decodes metadata, exact amounts and custom rails from offer and URI',()=>{
 const r=inspect(sampleOffer);assert.equal(r.amount,null);assert.equal(r.network,'mainnet');assert.deepEqual(r.rails,[ARKADE,BARK,'btc:mainnet','ln:mainnet']);assert.equal(r.metadataPresent,true);
 assert.deepEqual(inspect('lightning:'+sampleOffer.toUpperCase()),r);
 const {onchain,warnings,...rest}=inspect('bitcoin:?lno='+sampleOffer);const {onchain:_,warnings:__,...bare}=r;assert.deepEqual(rest,bare);assert.equal(onchain?.address,null);
 const amount=inspect('bitcoin:'+'00'.repeat(4)+'?amount=0.0001&lno='+encodeOffer([{type:8n,value:Uint8Array.of(7,161,32)}]));assert.equal(amount.amount,'500 sats');
});
test('shows the BIP321 on-chain address beside the offer and names known Ark servers',()=>{
 const r=inspect(sample);
 assert.equal(r.onchain?.address,'bc1qexampleaddressnotpayable');
 assert.ok(!r.warnings.some(w=>w.includes('no Bitcoin address')));
 assert.deepEqual(r.preference.map(p=>p.server),['arkade.computer · mainnet','ark.second.tech · mainnet',undefined,undefined]);
 assert.ok(inspect(sampleOffer).warnings.some(w=>w.includes('no Bitcoin address')));
});
test('keeps unknown bytes and malformed extension values visible',()=>{
 const r=inspect(encodeOffer([{type:24n,value:Uint8Array.of(255)},{type:1000000385n,value:new TextEncoder().encode('broken JSON')}]));
 assert.equal(r.fields[0].hex,'ff');assert.equal(r.fields[1].decoded,null);assert.equal(r.warnings.length,3);
});
test('rejects invalid input, duplicate URI offers and non-offer messages',()=>{
 for(const code of ['lni1qq','bad','lno1','bitcoin:?lno='+sampleOffer+'&lno='+sampleOffer])assert.throws(()=>inspect(code));
});
test('displays receiver order with Ark addresses and implicit LN fallback',()=>{
 const report=inspect(sample);
 assert.deepEqual(report.preference.map(r=>r.rail.split(':')[0]),['arkade','bark','btc','ln']);
 assert.equal(report.preference[0].address,'ark1examplearkadenotpayable');
 const broken=inspect(encodeOffer([{type:1000000385n,value:new TextEncoder().encode('[{"rail":"bark:zz"}]')}]));
 assert.deepEqual(broken.preference,[]);
 assert.ok(broken.warnings.some(w=>w.includes('Invalid value')));
});
