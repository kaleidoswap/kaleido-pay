/** Wallet-side orchestration. The receiver must supply an SDK-verified invoice. */
export interface ArkadeTransfer {
  id: string; network: 'mainnet' | 'mutinynet'; invoice: string; paymentHash: string;
  paySat: number; receiveSat: number; expiresAt: number;
  stage: 'prepared' | 'submitted' | 'pending' | 'completed' | 'unknown';
  maxTotalSat?: number;
}
export interface BarkPaymentState { type: 'unknown' | 'inProgress' | 'paid'; payment_hash?: string }
export interface BarkSender {
  network: 'mainnet' | 'mutinynet';
  estimateLightningSendFee(sats: number): Promise<{feeSats: number}>;
  payLightningInvoice(args: {invoice: string; wait: false}): Promise<BarkPaymentState>;
  checkLightningPayment(args: {paymentHash: string; wait: false}): Promise<BarkPaymentState>;
  /** Must enforce the whole wallet debit, not merely check an estimate. */
  payWithLimit?: (invoice: string, maxTotalSat: number) => Promise<BarkPaymentState>;
}
export interface TransferStore {
  get(id: string): Promise<ArkadeTransfer | null>;
  put(attempt: ArkadeTransfer): Promise<void>;
}
export interface ArkadeReceiver {
  /** Drive SDK reconciliation and verify spendable receipt, not just solver status. */
  reconcile(id: string): Promise<{settled: boolean; receivedSat: number}>;
}
export function createArkadeTransferController(sender: BarkSender, receiver: ArkadeReceiver, store: TransferStore) {
  const running = new Map<string, Promise<ArkadeTransfer>>();
  function single(id: string, work: ()=>Promise<ArkadeTransfer>) {
    const prior=running.get(id); if(prior) return prior;
    const task=work().finally(()=>running.delete(id)); running.set(id,task); return task;
  }
  async function save(a: ArkadeTransfer, stage: ArkadeTransfer['stage']) {
    const next={...a,stage}; await store.put(next); return next;
  }
  async function load(id: string) {
    const a=await store.get(id); if(!a) throw new Error('Transfer not found');
    if(a.network!==sender.network) throw new Error('Wallet network differs from receiver');
    return a;
  }
  async function reconcile(a: ArkadeTransfer) {
    if(a.stage==='prepared'||a.stage==='completed') return a;
    try {
      const [paid,received]=await Promise.all([
        sender.checkLightningPayment({paymentHash:a.paymentHash,wait:false}),receiver.reconcile(a.id),
      ]);
      if(paid.type==='paid' && paid.payment_hash!==a.paymentHash) throw new Error('Unexpected payment hash');
      return save(a,paid.type==='paid'&&received.settled&&received.receivedSat>=a.receiveSat?'completed':paid.type==='unknown'?'unknown':'pending');
    } catch { return save(a,'unknown'); }
  }
  return {
    /** Estimates are shown as estimates; they are not enforced spending limits. */
    async quoteWalletFee(id: string) {
      const a=await load(id); const q=await sender.estimateLightningSendFee(a.paySat);
      if(!Number.isSafeInteger(q.feeSats)||q.feeSats<0) throw new Error('Invalid wallet fee');
      return {estimatedWalletFeeSat:q.feeSats,estimatedTotalSat:a.paySat+q.feeSats,canEnforceLimit:!!sender.payWithLimit};
    },
    execute(id: string, approvedMaxTotalSat: number) { return single(id,async()=>{
      let a=await load(id);
      if(a.stage!=='prepared') return reconcile(a);
      if(![a.paySat,a.receiveSat,approvedMaxTotalSat].every(Number.isSafeInteger)||a.receiveSat<=0||a.paySat<a.receiveSat||approvedMaxTotalSat<a.paySat) throw new Error('Invalid approved amounts');
      if(a.expiresAt<=Date.now()/1000+120) throw new Error('Receive request expires too soon');
      if(!sender.payWithLimit) throw new Error('Bark sender does not enforce a spending limit');
      const fee=await sender.estimateLightningSendFee(a.paySat);
      if(!Number.isSafeInteger(fee.feeSats)||fee.feeSats<0||a.paySat+fee.feeSats>approvedMaxTotalSat) throw new Error('Wallet fee exceeds approval');
      a=await save({...a,maxTotalSat:approvedMaxTotalSat},'submitted');
      // The payer must return while a hold invoice is pending; reconciliation releases it.
      try { await sender.payWithLimit(a.invoice,approvedMaxTotalSat); }
      catch { return save(a,'unknown'); }
      return reconcile(a);
    }); },
    /** A restarted controller never submits another payment. */
    resume(id: string) { return single(id,async()=>reconcile(await load(id))); },
  };
}
