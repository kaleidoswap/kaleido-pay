// Local Mutinynet recipient inspection / offer generation only. No send RPCs.
const http2=require('node:http2'),fs=require('node:fs'),crypto=require('node:crypto');
const path=require('node:path');
const workspace=path.resolve(__dirname,'../..');
const protobuf=require(process.env.KALEIDOPAY_PROTOBUF_MODULE || path.join(workspace,'Rate/node_modules/protobufjs'));
const base=process.env.KALEIDOPAY_NODE_DIR || path.join(workspace,'kaleidoswap-maker-rs/e2e/signet-smoke/run');
(async()=>{
 const root=await protobuf.load(base+'/ldk-server-src/ldk-server-grpc/src/proto/api.proto');
 const key=fs.readFileSync(base+'/data/signet/api_key').toString('hex');
 const client=http2.connect('https://localhost:13646',{ca:fs.readFileSync(base+'/certs/client.crt')});
 const rpc=async(method,obj={})=>{
  const type=root.lookupType('api.'+method+'Request'),ret=root.lookupType('api.'+method+'Response');
  const data=type.encode(type.fromObject(obj)).finish();const frame=Buffer.alloc(data.length+5);frame.writeUInt32BE(data.length,1);Buffer.from(data).copy(frame,5);
  const stamp=BigInt(Math.floor(Date.now()/1000)),ts=Buffer.alloc(8);ts.writeBigUInt64BE(stamp);
  const sig=crypto.createHmac('sha256',key).update(ts).update(frame).digest('hex');
  return await new Promise((resolve,reject)=>{
   const req=client.request({':method':'POST',':path':'/api.LightningNode/'+method,'content-type':'application/grpc','te':'trailers','x-auth':`HMAC ${stamp}:${sig}`});
   let chunks=[],status='0';req.setTimeout(15000,()=>req.destroy(new Error('RPC timeout')));
   req.on('response',h=>{status=String(h['grpc-status']??status)});req.on('trailers',h=>{status=String(h['grpc-status']??status)});req.on('data',b=>chunks.push(b));req.on('error',reject);
   req.on('end',()=>{try{if(status!=='0')throw new Error('RPC '+method+' status '+status);const b=Buffer.concat(chunks);resolve(ret.toObject(ret.decode(b.subarray(5)),{longs:String,defaults:true}));}catch(e){reject(e)}});req.end(frame);
  });
 };
 try {
 const info=await rpc('GetNodeInfo');const channels=await rpc('ListChannels');
 console.log(JSON.stringify({nodeId:info.nodeId,bestBlock:info.currentBestBlock,channels:channels.channels.map(c=>({peer:c.counterpartyNodeId,usable:c.isUsable,announced:c.isAnnounced,inboundMsat:c.inboundCapacityMsat}))},null,2));
 if(process.argv.includes('--payments')) {
  const offer=JSON.parse(fs.readFileSync(base+'/kaleidopay-offer.json','utf8'));
  let token; const matched=[];
  for(let page=0;page<100;page++) {
   const result=await rpc('ListPayments',token?{pageToken:token}:{});
   for(const p of result.payments||[]){const k=p.kind?.bolt12Offer;if(k?.offerId===offer.offerId)matched.push({id:p.id,hash:k.hash,offerId:k.offerId,amountMsat:p.amountMsat,status:p.status,direction:p.direction});}
   token=result.nextPageToken;if(!token)break;
   if(page===99)throw new Error('Payment pagination limit reached');
  }
  fs.writeFileSync(base+'/kaleidopay-recipient-payments.json',JSON.stringify(matched,null,2),{mode:0o600});
  console.log(JSON.stringify({matchingOfferPayments:matched},null,2));
 }
 if(process.argv.includes('--offer')){const r=await rpc('Bolt12Receive',{description:'KaleidoPay unfunded Arkade feasibility',amountMsat:'20000000',expirySecs:3600});fs.writeFileSync(base+'/kaleidopay-offer.json',JSON.stringify(r,null,2),{mode:0o600});console.log('Test offer saved locally; no payment requested or sent.');}
 }finally{client.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
