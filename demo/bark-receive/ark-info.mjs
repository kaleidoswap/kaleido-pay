// Read-only: prints Second's Ark server info from a throwaway, empty wallet in a temporary profile.
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
const net=process.argv[2]==='signet'?{name:'Signet',server:'https://ark.signet.2nd.dev',esplora:'https://esplora.signet.2nd.dev'}:{name:'Bitcoin',server:'https://ark.second.tech',esplora:'https://mempool.second.tech/api'};
const sdk=resolve(import.meta.dirname,'node_modules/@secondts/bark/web');
const server=createServer(async(req,res)=>{const name=req.url==='/'?null:req.url.slice(1);
 if(!name){res.setHeader('content-type','text/html');res.end('<!doctype html><title>ark info</title>');return;}
 if(!['bark_ffi_wasm.js','bark_ffi_wasm_bg.wasm'].includes(name)){res.writeHead(404).end();return;}
 res.setHeader('content-type',name.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await readFile(resolve(sdk,name)));});
await new Promise(r=>server.listen(18766,'127.0.0.1',r));
const profile=await mkdtemp(join(tmpdir(),'ark-info-'));
let context;
try{
 context=await chromium.launchPersistentContext(profile,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await context.newPage();
 await page.route('https://**/*',async route=>{try{const q=route.request();const headers={...q.headers()};delete headers.host;delete headers['content-length'];
  const r=await fetch(q.url(),{method:q.method(),headers,body:q.postDataBuffer()??undefined,signal:AbortSignal.timeout(30000)});
  const h=Object.fromEntries(r.headers);delete h['content-encoding'];delete h['content-length'];
  await route.fulfill({status:r.status,headers:h,body:Buffer.from(await r.arrayBuffer())});}catch{await route.abort('failed');}});
 await page.goto('http://127.0.0.1:18766');
 const info=await page.evaluate(async n=>{const bark=await import('/bark_ffi_wasm.js');await bark.default();
  const w=await bark.Wallet.open(n.name,bark.generateMnemonic(),{serverAddress:n.server,esploraAddress:n.esplora},null,{runDaemon:false,indexedDbName:'ark-info-'+Date.now(),createIfNotExists:true,skipRecovery:true});
  try{await w.sync()}catch(e){}const i=await w.arkInfo();const methods=Object.getOwnPropertyNames(Object.getPrototypeOf(w)).filter(m=>/info|server|ark/i.test(m));return {serverPubkey:i?.serverPubkey??i?.server_pubkey??null,keys:i?Object.keys(i):null,methods};},net);
 console.log(JSON.stringify(info));
}finally{await context?.close();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true});}
