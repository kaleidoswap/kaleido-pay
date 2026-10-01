import { decode } from 'light-bolt11-decoder';
export function invoiceFacts(invoice: string, network: 'bitcoin' | 'mutinynet' = 'mutinynet') {
  if (!(network === 'bitcoin' ? /^lnbc[0-9]/ : /^lntbs[0-9]/).test(invoice)) throw new Error('Unexpected invoice network; chain identity still requires provider verification');
  const d=decode(invoice);
  const field=(name:string)=>(d.sections as any[]).find(s=>s.name===name)?.value;
  const msat=Number(field('amount')), stamp=Number(field('timestamp')), expiry=Number(field('expiry')??3600);
  const hash=String(field('payment_hash'));
  if(!Number.isSafeInteger(msat)||msat<=0||msat%1000||!Number.isSafeInteger(stamp)||!Number.isSafeInteger(expiry)||expiry<=0||!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Invalid invoice facts');
  return {raw:invoice,paymentHash:hash,amountSats:msat/1000,expiresAt:stamp+expiry};
}
