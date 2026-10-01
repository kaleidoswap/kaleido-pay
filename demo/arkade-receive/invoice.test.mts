import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invoiceFacts } from './invoice.mts';
const invoice="lntbs20560n1p4tavezpp56ge9eca5r3rxf8v9wj0x8f6ueyyal74yxff0aykq7hwt99gn9y9qdqqcqzpkxqrpcgsp5x70nsur8jjl6glderwpj6cttlyhaj7fmsd8uz8xc5k9xpddqpwes9qxpqysgqjn5fj9nz2vlnnwrfysczju06z7r3wm3cgpgzca4hw8t6ehtksnujvz249wdv43jtzndj5fl4wsjdtfre9wjzawdvljnmpfvmaze7uygqxcdkgy";
test('decode public unfunded signet invoice',()=>{const facts=invoiceFacts(invoice); assert.equal(facts.amountSats,2056); assert.equal(facts.paymentHash.length,64); assert.equal(facts.expiresAt,1790884394);});
test('reject wrong network and malformed invoices',()=>{assert.throws(()=>invoiceFacts(invoice.replace('lntbs','lnbc')));assert.throws(()=>invoiceFacts('lntbs1bad'));});
