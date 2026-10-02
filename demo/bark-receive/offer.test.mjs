import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encodeOffer} from '../../packages/universal-code/src/offer.ts';
import {reviewOffer,paymentEvidence,verifyRepeatedOffer} from './offer.mjs';
const fields=[{type:8n,value:Uint8Array.of(1,134,160)},{type:22n,value:new Uint8Array(33).fill(2)}];
const offer=encodeOffer(fields);
test('review checks amount/network/expiry without claiming protocol validation',()=>{
 assert.equal(reviewOffer(offer,100).protocolValidated,false);
 assert.throws(()=>reviewOffer(offer,101),/amount/);
 assert.throws(()=>reviewOffer(encodeOffer([...fields,{type:2n,value:new Uint8Array(32)}]),100),/mainnet/);
 assert.throws(()=>reviewOffer(encodeOffer([...fields,{type:14n,value:Uint8Array.of(1)}]),100),/expires/);
 assert.throws(()=>reviewOffer(offer,0.5),/whole/);
});
test('two payments require distinct proven hashes for the same offer',()=>{
 const review=reviewOffer(offer,100);
 const paid=n=>{const preimage=Buffer.alloc(32,n).toString('hex');return paymentEvidence(review,{type:'paid',preimage,payment_hash:createHash('sha256').update(Buffer.from(preimage,'hex')).digest('hex')})};
 const a=paid(1),b=paid(2);
 assert.equal('preimage' in a,false);
 assert.equal(verifyRepeatedOffer([a,b]).distinctPayments,2);
 assert.throws(()=>verifyRepeatedOffer([a,a]),/twice/);
 assert.throws(()=>verifyRepeatedOffer([a,{...b,offerFingerprint:'other'}]),/different/);
 assert.throws(()=>verifyRepeatedOffer([a,{...b,status:'pending'}]),/proven/);
 assert.throws(()=>paymentEvidence(review,{type:'paid',preimage:'00'.repeat(32),payment_hash:'11'.repeat(32)}),/proof/);
});
