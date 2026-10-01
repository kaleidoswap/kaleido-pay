import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invoiceFacts } from './invoice.mts';
const invoice="lntbs20560n1p4tavezpp56ge9eca5r3rxf8v9wj0x8f6ueyyal74yxff0aykq7hwt99gn9y9qdqqcqzpkxqrpcgsp5x70nsur8jjl6glderwpj6cttlyhaj7fmsd8uz8xc5k9xpddqpwes9qxpqysgqjn5fj9nz2vlnnwrfysczju06z7r3wm3cgpgzca4hw8t6ehtksnujvz249wdv43jtzndj5fl4wsjdtfre9wjzawdvljnmpfvmaze7uygqxcdkgy";
test('decode public unfunded signet invoice',()=>{const facts=invoiceFacts(invoice); assert.equal(facts.amountSats,2056); assert.equal(facts.paymentHash.length,64); assert.equal(facts.expiresAt,1790884394);});
test('reject wrong network and malformed invoices',()=>{assert.throws(()=>invoiceFacts(invoice.replace('lntbs','lnbc')));assert.throws(()=>invoiceFacts('lntbs1bad'));});

const mainnetInvoice="lnbc5040n1p4tadfzpp53d9mjr97zt458dffl5zce5lmnuqj4rv54wgfavtvuwjjg8ekrr7sdqz9ccqzdyxqrpwusp5u8frl6lurk3h825dzuzax745lj542qah2gqvn3tyrqg4tmen9elq9qxpqysgqyec8hmjlukge68dv4um9yjd3wh5vv824fjds6x83hpun8zqgdcy58ac0yt6zdr5y0hzr6j796w2hzk8dfyk7qxw0pwuc3zwa49at4gsp6y6hvk";
test('mainnet probe decodes correct network and rejects testnet',()=>{assert.equal(invoiceFacts(mainnetInvoice,'bitcoin').amountSats,504);assert.throws(()=>invoiceFacts(mainnetInvoice));assert.throws(()=>invoiceFacts(invoice,'bitcoin'));});

import { reviewReceive } from './review.mts';
const facts=invoiceFacts(mainnetInvoice,'bitcoin');
const record={id:'fixture',phase:'prepared',invoice:mainnetInvoice,payAmountSats:504,expectedAmountSats:500,invoiceExpiresAt:facts.expiresAt,quote:{profile:{payment_hash:facts.paymentHash}}};
test('unknown wallet fee stays unknown and never authorizes payment',()=>{const r=reviewReceive(record,'bitcoin',null,facts.expiresAt-600);assert.equal(r.maxTotalSats,null);assert.equal(r.swapFeeSats,4);assert.equal(r.paymentAuthorized,false);assert.equal(reviewReceive(record,'bitcoin',20,facts.expiresAt-600).maxTotalSats,524);});
test('review rejects stale, altered, wrong-state and unbounded inputs',()=>{assert.throws(()=>reviewReceive(record,'bitcoin',0,facts.expiresAt));assert.throws(()=>reviewReceive({...record,payAmountSats:505},'bitcoin',0,0));assert.throws(()=>reviewReceive({...record,phase:'funded'},'bitcoin',0,0));assert.throws(()=>reviewReceive(record,'bitcoin',-1,0));});
