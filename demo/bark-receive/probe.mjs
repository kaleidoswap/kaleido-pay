import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
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
