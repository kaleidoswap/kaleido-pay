import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArkadeTransferController, type ArkadeTransfer} from '../src/arkade-transfer';
function fixture() {
 let a:ArkadeTransfer={id:'test',network:'mainnet',invoice:'verified-by-receiver',paymentHash:'hash',paySat:504,receiveSat:500,expiresAt:Math.floor(Date.now()/1000)+600,stage:'prepared'};
 let sends=0;
 const store={get:async()=>({...a}),put:async(n:ArkadeTransfer)=>{a={...n};}};
 const sender={network:'mainnet' as const,estimateLightningSendFee:async()=>({feeSats:2}),payLightningInvoice:async()=>({type:'inProgress' as const}),checkLightningPayment:async()=>({type:'paid' as const,payment_hash:'hash'}),payWithLimit:async()=>{assert.equal(a.stage,'submitted');sends++;return {type:'inProgress' as const};}};
 const receiver={reconcile:async()=>({settled:true,receivedSat:500})};
 return {store,sender,receiver,count:()=>sends};
}
test('persist before sending; concurrent clicks send once; restart never repays',async()=>{const f=fixture(),c=createArkadeTransferController(f.sender,f.receiver,f.store); const results=await Promise.all([c.execute('test',506),c.execute('test',506)]);assert.equal(f.count(),1);assert.equal(results[0].stage,'completed');await createArkadeTransferController(f.sender,f.receiver,f.store).resume('test');assert.equal(f.count(),1);});
test('unknown send outcome stays recoverable and is never resent',async()=>{const f=fixture();f.sender.payWithLimit=async()=>{throw new Error('lost response');};const c=createArkadeTransferController(f.sender,f.receiver,f.store);assert.equal((await c.execute('test',506)).stage,'unknown');assert.equal((await c.resume('test')).stage,'completed');});
test('missing fee enforcement and excessive fees refuse before submission',async()=>{const f=fixture();await assert.rejects(createArkadeTransferController({...f.sender,payWithLimit:undefined},f.receiver,f.store).execute('test',506));await assert.rejects(createArkadeTransferController(f.sender,f.receiver,f.store).execute('test',505));assert.equal((await f.store.get()).stage,'prepared');});
test('Lightning success alone is not completion',async()=>{const f=fixture();const c=createArkadeTransferController(f.sender,{reconcile:async()=>({settled:false,receivedSat:0})},f.store);assert.equal((await c.execute('test',506)).stage,'pending');});
test('storage failure prevents submission',async()=>{const f=fixture();await assert.rejects(createArkadeTransferController(f.sender,f.receiver,{...f.store,put:async()=>{throw Error('storage');}}).execute('test',506));assert.equal(f.count(),0);});
