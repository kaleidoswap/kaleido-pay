import { invoiceFacts } from './invoice.mts';
export interface ReceiveReviewInput {
  id: string; phase: string; invoice: string; payAmountSats: number;
  expectedAmountSats: number; invoiceExpiresAt: number;
  quote: { profile: { payment_hash?: string } };
}
/** Builds a review, never authorizes or initiates a payment. null means unknown fee. */
export function reviewReceive(r: ReceiveReviewInput, network: 'bitcoin' | 'mutinynet', walletFeeCapSats: number | null, now = Math.floor(Date.now()/1000)) {
  const facts = invoiceFacts(r.invoice,network);
  if(r.phase !== 'prepared') throw new Error('Attempt is not awaiting payment');
  if(facts.paymentHash !== r.quote.profile.payment_hash || facts.amountSats !== r.payAmountSats || facts.expiresAt !== r.invoiceExpiresAt) throw new Error('Invoice does not match saved attempt');
  if(!Number.isSafeInteger(r.expectedAmountSats)||r.expectedAmountSats<=0||r.payAmountSats<r.expectedAmountSats) throw new Error('Invalid receive amount');
  if(facts.expiresAt <= now+120) throw new Error('Invoice expired or too close to expiry');
  if(walletFeeCapSats !== null && (!Number.isSafeInteger(walletFeeCapSats)||walletFeeCapSats<0||!Number.isSafeInteger(walletFeeCapSats+r.payAmountSats))) throw new Error('Invalid wallet fee cap');
  return {id:r.id,network,paymentHash:facts.paymentHash,payAmountSats:r.payAmountSats,receiveAmountSats:r.expectedAmountSats,swapFeeSats:r.payAmountSats-r.expectedAmountSats,walletFeeCapSats,maxTotalSats:walletFeeCapSats===null?null:r.payAmountSats+walletFeeCapSats,expiresAt:facts.expiresAt,paymentAuthorized:false};
}
