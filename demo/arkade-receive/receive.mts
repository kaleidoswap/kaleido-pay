import { DatabaseSync } from 'node:sqlite';
import { SQLiteWalletRepository, SQLiteContractRepository } from '@arkade-os/sdk/repositories/sqlite';
import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Wallet, SingleKey, RestIndexerProvider } from '@arkade-os/sdk';
import { ArkadeIntentsVenue } from '@kaleidorg/swap-sdk/arkade';
import { nostrRfqTransport } from '@arkade-os/swap/nostr';
import { reviewReceive } from './review.mts';
import { invoiceFacts } from './invoice.mts';

const { values: opts } = parseArgs({ options: {
  'fund-send': { type: 'string' }, 'approved-total': { type: 'string' }, 'send-invoice': { type: 'string' }, 'mainnet-recovery': { type: 'boolean' }, inspect: { type: 'boolean' }, 'mainnet-probe': { type: 'boolean' }, prepare: { type: 'boolean' }, resume: { type: 'boolean' }, watch: { type: 'boolean' },
  amount: { type: 'string', default: '2000' },
  'max-pay': { type: 'string', default: '2200' },
} });
if (opts.inspect && (opts.prepare || opts.resume || opts.watch)) throw new Error('--inspect is read-only and exclusive');
if (opts.watch && !opts.resume) throw new Error('--watch requires --resume');
if (opts.prepare && opts.resume) throw new Error('Choose prepare or resume');
const mainnetRecovery = !!opts['mainnet-recovery'];
if (mainnetRecovery && (opts['mainnet-probe'] || !opts.resume)) throw new Error('--mainnet-recovery requires --resume and excludes --mainnet-probe');
const mainnetProbe = !!opts['mainnet-probe'] || mainnetRecovery;
if (mainnetProbe && !mainnetRecovery && (opts.resume || opts.watch)) throw new Error('Mainnet probe cannot claim or reconcile');
if (opts['send-invoice'] && (!opts.prepare || !opts['mainnet-probe'])) throw new Error('--send-invoice requires --mainnet-probe --prepare');
if (opts['fund-send'] && (!mainnetRecovery || !opts.resume || opts.prepare || opts.inspect || opts.watch)) throw new Error('--fund-send requires --mainnet-recovery --resume exclusively');
const amount = Number(opts.amount), maxPay = Number(opts['max-pay']);
if (![amount,maxPay].every(n => Number.isSafeInteger(n) && n > 0) || maxPay < amount) throw new Error('Invalid amounts');
const network = mainnetProbe ? 'bitcoin' : 'mutinynet';
const server = mainnetProbe ? 'https://arkade.computer' : 'https://mutinynet.arkade.sh';
const registryUrl = `https://arkade-os.github.io/solver-registry/${network}.json`;
const readJson = async (url: string) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return r.json();
};
const [registry, info] = await Promise.all([readJson(registryUrl), readJson(server+'/v1/info')]);
if (registry.network !== network || info.network !== network) throw new Error('Network mismatch');
const pinned = mainnetProbe ? '66422c952f8dcb96e4d0c3f049cd1e265b8461b916d9913c65c2494b64b4e3ce' : '3f831510a6d7678d0c90d7d6fbc4057720517e2e30681ef4c87cc57aaf57e8d5';
const market = registry.markets.find((m: any) => m.discovery_pubkey === pinned && m.quote_corridor === 'lightning' && m.base_asset?.id === 'btc' && m.quote_asset?.id === 'btc');
if (!market && !mainnetProbe) throw new Error('Pinned Mutinynet Lightning market unavailable');
if (market && (amount < Number(market.min_base_amount) || amount > Number(market.max_base_amount))) throw new Error('Amount outside advertised limits');
console.log(JSON.stringify({network:info.network,solver:market?.solver ?? 'legacy configured mainnet solver (unlisted)',solverPubkey:pinned,registryGeneratedAt:registry.generated_at,feeBps:market?.fee_bps,readiness:market ? 'advertised, not settlement verified' : 'unlisted; probing availability only'},null,2));
if (!opts.prepare && !opts.resume && !opts.inspect) process.exit(0);

// Keep state outside the source folder; only one process may use this wallet.
process.umask(0o077);
const dir = resolve(import.meta.dirname, mainnetProbe ? '../.attempts/arkade-mainnet-probe' : '../.attempts/arkade-receive');
await mkdir(dir,{recursive:true,mode:0o700});
const lock = await open(resolve(dir,'process.lock'),'wx',0o600);
let wallet: any, transport: any, db: DatabaseSync | undefined;
const save = async (name: string, data: unknown) => {
  const dest = resolve(dir,name), tmp = dest+'.tmp';
  await writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600});
  await rename(tmp,dest);
};
try {
  let identity: SingleKey;
  try { identity = SingleKey.fromHex(JSON.parse(await readFile(resolve(dir,'identity.json'),'utf8')).privateKey); }
  catch(e: any) {
    if (e.code !== 'ENOENT' || opts.resume || opts.inspect) throw e;
    identity = SingleKey.fromRandomBytes();
    await save('identity.json',{privateKey:identity.toHex()});
  }
  let records: Record<string, any> = {};
  try { records = JSON.parse(await readFile(resolve(dir,'records.json'),'utf8')); }
  catch(e: any) { if(e.code !== 'ENOENT') throw e; }
  const store = {
    async put(r: any) { records[r.id]=r; await save('records.json',records); },
    async get(id: string) { return records[id]; },
    async listPending() { return Object.values(records).filter((r:any)=>['prepared','funded'].includes(r.phase)); },
  };
  if(opts.prepare && (await store.listPending()).length) throw new Error('An attempt is pending; use --resume');
  db = new DatabaseSync(resolve(dir,'wallet.sqlite'));
  const sql = {
    async run(query:string, params:any[] = []) { db!.prepare(query).run(...params); },
    async get(query:string, params:any[] = []) { return db!.prepare(query).get(...params) as any; },
    async all(query:string, params:any[] = []) { return db!.prepare(query).all(...params) as any; },
  };
  wallet = await Wallet.create({storage:{walletRepository:new SQLiteWalletRepository(sql),contractRepository:new SQLiteContractRepository(sql)},identity,arkServerUrl:server,esploraUrl:mainnetProbe ? 'https://mempool.space/api' : 'https://mutinynet.com/api',settlementConfig:false});
  transport = nostrRfqTransport({relays:['wss://nostr.arkade.sh'],solverPubkey:pinned,timeoutMs:15000});
  const venue = new ArkadeIntentsVenue({wallet,arkServerUrl:server,transport,store});
  if(opts['fund-send']) {
    const id=opts['fund-send'];
    if(!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid swap id');
    const record=await store.get(id), cap=Number(opts['approved-total']);
    if(!record || record.route!=='arkade:BTC->lightning:BTC' || record.phase!=='prepared') throw new Error('Send is not prepared');
    if(!Number.isSafeInteger(cap)||cap<=0||!Number.isSafeInteger(record.fundAmountSats)||record.fundAmountSats>cap) throw new Error('Funding exceeds approval');
    if(record.quote.valid_until<=Date.now()/1000+30) throw new Error('Quote expired or too close to expiry');
    const fees=info.fees;
    if(!fees || Number(fees.txFeeRate)!==0 || Number(fees.intentFee?.offchainInput)!==0 || Number(fees.intentFee?.offchainOutput)!==0) throw new Error('Unexpected Arkade transfer fee policy');
    const balance=await wallet.getBalance();
    if(balance.available<record.fundAmountSats) throw new Error('Insufficient spendable Arkade balance');
    // A lost send response must never cause an automatic duplicate funding.
    await writeFile(resolve(dir,`fund-${id}.json`),JSON.stringify({id,approvedTotal:cap,amount:record.fundAmountSats,submittedAt:Date.now()}),{mode:0o600,flag:'wx'});
    const txid=await wallet.sendBitcoin({address:record.address,amount:record.fundAmountSats});
    await venue.notifyFunded(id,txid);
    console.log(JSON.stringify({id,fundingTxid:txid,fundedSats:record.fundAmountSats}));
  } else if(opts.inspect) {
    const reviews = Object.values(records).map((r:any)=>{try{return reviewReceive(r,mainnetProbe?'bitcoin':'mutinynet',null);}catch(e:any){return {id:r.id,phase:r.phase,paymentAuthorized:false,reason:e.message};}});
    console.log(JSON.stringify({reviews,balance:await wallet.getBalance()},(_,v)=>typeof v==='bigint'?v.toString():v,2));
  } else if(opts['send-invoice']) {
    const input=JSON.parse(await readFile(resolve(opts['send-invoice']),'utf8'));
    const invoice=invoiceFacts(input.invoice,'bitcoin');
    if(invoice.expiresAt <= Date.now()/1000+120) throw new Error('Invoice expires too soon');
    const result=await venue.prepareLightningSend({invoice});
    console.log(JSON.stringify({id:result.record.id,fundAmountSats:result.fundAmountSats,receiveAmountSats:invoice.amountSats,feeSats:result.fundAmountSats-invoice.amountSats,validUntil:result.summary.validUntil,withinRequestedLimit:result.fundAmountSats<=maxPay,status:'quoted only; no funds moved'},null,2));
  } else if(opts.prepare) {
    const result = await venue.prepareLightningReceive({amountSats:amount,maxPayAmountSats:maxPay,amountSide:'to',decodeInvoice:(invoice:string)=>invoiceFacts(invoice,mainnetProbe ? 'bitcoin' : 'mutinynet')
    });
    // Never print an invoice before the SDK has verified it and persisted recovery.
    console.log(JSON.stringify({id:result.record.id,payAmountSats:result.payAmountSats,receiveAmountSats:result.summary.toAmountSats,expiresAt:result.invoiceExpiresAt,invoice:mainnetProbe ? undefined : result.invoice,status:mainnetProbe ? 'mainnet probe only; unfunded; payment not authorized' : 'prepared; unfunded; keep receiver running with --resume'},null,2));
  } else {
    const deadline = Date.now() + (opts.watch ? 35*60*1000 : 0);
    do {
      // An external payer cannot call notifyFunded; detect its exact lockup on-chain.
      for (const record of await store.listPending()) {
        if (record.phase !== 'prepared' || record.route !== 'lightning:BTC->arkade:BTC') continue;
        const { vtxos } = await new RestIndexerProvider(server).getVtxos({scripts:[record.swapPkScriptHex]});
        if ((vtxos ?? []).some(v => !v.isSpent && v.value >= record.expectedAmountSats)) {
          await venue.notifyFunded(record.id);
        }
      }
      const report = await venue.reconcile();
      console.log(JSON.stringify({settled:report.settled,pending:report.pending,refunded:report.refunded,cancelled:report.cancelled,needsRecovery:report.needsRecovery,errorIds:report.errors.map(e=>e.id)},null,2));
      if (!opts.watch || Date.now() >= deadline || !(await store.listPending()).length) break;
      await new Promise(r=>setTimeout(r,5000));
    } while(true);
  }
} finally {
  await transport?.close();
  await wallet?.dispose();
  db?.close();
  await lock.close();
  await unlink(resolve(dir,'process.lock'));
}
