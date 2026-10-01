import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOfferRequest, inspectCreateResponse } from './bolt12-arkade-preflight';
import { encodeOffer } from '../packages/universal-code/src/index';
const offer = encodeOffer([{type:10n,value:new TextEncoder().encode('not a payable offer')}]);
const pk = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
test('pins Arkade without supplying a fabricated invoice hash',()=>{
  const r=buildOfferRequest(offer,20000,pk);
  assert.equal(r.pairId,'BTC@LN/BTC@ARK'); assert.equal('preimageHash' in r,false); assert.equal('invoice' in r,false);
  assert.throws(()=>buildOfferRequest(offer,1.2,pk)); assert.throws(()=>buildOfferRequest(offer,20000,'02'+'00'.repeat(32)));
});
const response={id:'fixture',preimageHash:'ab'.repeat(32),invoiceAmount:20000,expectedAmount:20200,address:'tark1fixture',arkadeRefundLocktime:7000,swapAuth:'must-not-leak'};
test('rejects amount mismatch, missing hash and insufficient headroom',()=>{
  assert.throws(()=>inspectCreateResponse({...response,invoiceAmount:20001},20000,1000));
  assert.throws(()=>inspectCreateResponse({...response,preimageHash:undefined},20000,1000));
  assert.throws(()=>inspectCreateResponse({...response,arkadeRefundLocktime:1100},20000,1000));
});
test('metadata never authorizes funding or leaks swap credentials',()=>{
  const r=inspectCreateResponse(response,20000,1000);
  assert.equal(r.fundable,false); assert.equal(r.verdict,'maker_reported_offer_binding');
  assert.equal(JSON.stringify(r).includes('must-not-leak'),false);
  assert.equal(inspectCreateResponse({error:'offer_invoice_unavailable'},20000).verdict,'create_failed');
});
