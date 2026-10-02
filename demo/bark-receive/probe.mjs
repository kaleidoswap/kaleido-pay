import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {invoiceFacts} from '../arkade-receive/invoice.mts';
import {chromium} from 'playwright-core';
import {reviewOffer} from './offer.mjs';
process.umask(0o077);
const state=resolve(import.meta.dirname,'../.attempts/bark-mainnet');
await mkdir(state,{recursive:true,mode:0o700});
const sdk=resolve(import.meta.dirname,'node_modules/@secondts/bark/web');
const server=createServer(async(req,res)=>{try {
 if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>KaleidoPay Bark SDK test</title>');return;}
 const name=req.url?.slice(1);
 if(!['bark_ffi_wasm.js','bark_ffi_wasm_bg.wasm'].includes(name)){res.writeHead(404).end();return;}
 res.setHeader('content-type',name.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await readFile(resolve(sdk,name)));
}catch{res.writeHead(500).end();}});
await new Promise(r=>server.listen(18765,'127.0.0.1',r));
let context;
try{
 context=await chromium.launchPersistentContext(resolve(state,'browser'),{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await context.newPage();
 // Use the host's configured HTTPS proxy, preserving certificate verification.
 await page.route('https://**/*',async route=>{try{
  const q=route.request(); const headers={...q.headers()};delete headers.host;delete headers['content-length'];
  const r=await fetch(q.url(),{method:q.method(),headers,body:q.postDataBuffer()??undefined,signal:AbortSignal.timeout(30000)});
  const h=Object.fromEntries(r.headers);delete h['content-encoding'];delete h['content-length'];
  await route.fulfill({status:r.status,headers:h,body:Buffer.from(await r.arrayBuffer())});
 }catch{await route.abort('failed');}});
 await page.goto('http://127.0.0.1:18765');
 await page.evaluate(async()=>{globalThis.bark=await import('/bark_ffi_wasm.js');await globalThis.bark.default();});
 let mnemonic;
 try{mnemonic=JSON.parse(await readFile(resolve(state,'identity.json'),'utf8')).mnemonic;}
 catch(e){if(e.code!=='ENOENT')throw e;mnemonic=await page.evaluate(()=>globalThis.bark.generateMnemonic());await writeFile(resolve(state,'identity.json'),JSON.stringify({network:'bitcoin',mnemonic}),{mode:0o600,flag:'wx'});}
 const result=await page.evaluate(async seed=>{
  globalThis.wallet=await globalThis.bark.Wallet.open('Bitcoin',seed,{serverAddress:'https://ark.second.tech',esploraAddress:'https://mempool.second.tech/api'},null,{runDaemon:false,indexedDbName:'kaleidopay-mainnet',createIfNotExists:true,skipRecovery:false});
  const properties=await globalThis.wallet.properties();const balance=await globalThis.wallet.balance();
  return {network:properties.network,balance};
 },mnemonic);
 console.log(JSON.stringify(result,null,2));
 if(process.argv.includes('--offer-capabilities')) {
  console.log(JSON.stringify(await page.evaluate(()=>({payLightningOffer:typeof globalThis.wallet.payLightningOffer==='function',estimateLightningSendFee:typeof globalThis.wallet.estimateLightningSendFee==='function'}))));
 }
 if(process.argv.includes('--offer-review')) {
  const file=process.argv[process.argv.indexOf('--offer-review')+1];
  const amount=Number(process.argv[process.argv.indexOf('--amount')+1]);
  if(!file || !process.argv.includes('--amount'))throw Error('Use --offer-review <offer text file> --amount <sats>');
  const review=reviewOffer(await readFile(resolve(file),'utf8'),amount);
  const estimate=await page.evaluate(sats=>globalThis.wallet.estimateLightningSendFee(sats),amount);
  console.log(JSON.stringify({offerFingerprint:review.offerFingerprint,amountSats:amount,estimatedFeeSats:estimate.feeSats,estimatedTotalSats:estimate.grossAmountSats,protocolValidated:false,paymentAuthorized:false}));
 }

 if(process.argv.includes('--send-review') || process.argv.includes('--send')) {
  const records=JSON.parse(await readFile(resolve(import.meta.dirname,'../.attempts/arkade-mainnet-probe/records.json'),'utf8'));
  const pending=Object.values(records).filter(r=>r.route==='lightning:BTC->arkade:BTC'&&r.phase==='prepared');
  if(pending.length!==1)throw Error('Expected exactly one prepared Arkade receive');
  const r=pending[0], facts=invoiceFacts(r.invoice,'bitcoin');
  if(facts.expiresAt<Date.now()/1000+120 || facts.amountSats!==r.payAmountSats || facts.paymentHash!==r.quote.profile.payment_hash || r.expectedAmountSats!==500)throw Error('Unexpected or expired receive');
  const estimate=await page.evaluate(amount=>globalThis.wallet.estimateLightningSendFee(amount),facts.amountSats);
  console.log(JSON.stringify({id:r.id,invoiceSats:facts.amountSats,receiveSats:r.expectedAmountSats,estimatedFeeSats:estimate.feeSats,estimatedTotalSats:estimate.grossAmountSats,spendableSats:result.balance.spendableSats,feeCapSupported:false}));
  if(process.argv.includes('--send')){
   if(!process.argv.includes('--accept-estimated-fee'))throw Error('SDK has no hard fee cap; explicit estimated-fee acceptance required');
   if(!Number.isSafeInteger(estimate.feeSats)||estimate.feeSats<0||estimate.grossAmountSats!==facts.amountSats+estimate.feeSats||estimate.grossAmountSats>600||result.balance.spendableSats>1000)throw Error('Unexpected cost or wallet balance');
   await writeFile(resolve(state,`send-${facts.paymentHash}.json`),JSON.stringify({id:r.id,paymentHash:facts.paymentHash,estimatedTotalSats:estimate.grossAmountSats,submittedAt:Date.now()}),{mode:0o600,flag:'wx'});
   await writeFile(resolve(state,'outgoing.json'),JSON.stringify({id:r.id,paymentHash:facts.paymentHash}),{mode:0o600});
   const sent=await page.evaluate(invoice=>globalThis.wallet.payLightningInvoice({invoice,wait:false}),r.invoice);
   console.log(JSON.stringify({paymentHash:facts.paymentHash,status:sent.type,reportedFeeSats:sent.send?.feeSats}));
  }
 }
 if(process.argv.includes('--send-status')){
  const {paymentHash}=JSON.parse(await readFile(resolve(state,'outgoing.json'),'utf8'));
  const status=await page.evaluate(async hash=>{const p=await globalThis.wallet.checkLightningPayment({paymentHash:hash,wait:false});return {paymentHash:hash,status:p.type,reportedFeeSats:p.send?.feeSats,balance:await globalThis.wallet.balance()};},paymentHash);
  console.log(JSON.stringify(status));await writeFile(resolve(state,'outgoing-status.json'),JSON.stringify(status),{mode:0o600});
 }
 if(process.argv.includes('--invoice')){
  const invoice=await page.evaluate(()=>globalThis.wallet.bolt11Invoice({amountSats:1000,description:'KaleidoPay Arkade to Bark test'}));
  await writeFile(resolve(state,'receive.json'),JSON.stringify(invoice,null,2),{mode:0o600});
  console.log(JSON.stringify({invoiceCreated:true,amountSats:invoice.amountSats,paymentHash:invoice.paymentHash}));
 }
 if(process.argv.includes('--watch') || process.argv.includes('--status')) {
  const {paymentHash}=JSON.parse(await readFile(resolve(state,'receive.json'),'utf8'));
  const until=Date.now()+(process.argv.includes('--watch')?10*60*1000:0);
  do {
   const status=await page.evaluate(async ({hash,claim})=>{
    const receive=claim?await globalThis.wallet.tryClaimLightningReceive({paymentHash:hash,wait:false}):await globalThis.wallet.lightningReceiveState(hash);
    const balance=await globalThis.wallet.balance();
    return {paymentHash:hash,state:receive.state,amountSats:receive.amountSats,balance};
   },{hash:paymentHash,claim:process.argv.includes('--watch')});
   await writeFile(resolve(state,'status.json'),JSON.stringify(status,null,2),{mode:0o600});
   console.log(JSON.stringify(status));
   if(status.state==='settled'||Date.now()>=until) break;
   await new Promise(r=>setTimeout(r,3000));
  }while(true);
 }
 await page.evaluate(()=>globalThis.wallet.free());
}finally{await context?.close();await new Promise(r=>server.close(r));}
