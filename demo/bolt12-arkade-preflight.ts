import { decodeOffer } from '../packages/universal-code/src/index';
import { secp256k1 } from '@noble/curves/secp256k1';
export const ARKADE_PAIR = 'BTC@LN/BTC@ARK';
export function buildOfferRequest(offer: string, amountSat: number, refundPublicKey: string) {
  decodeOffer(offer); // Structural only: the node must validate offer semantics.
  if (!Number.isSafeInteger(amountSat) || amountSat <= 0 || amountSat > 2100000000000000) throw new Error('Invalid recipient amount');
  if (!/^(02|03)[0-9a-f]{64}$/i.test(refundPublicKey)) throw new Error('Expected compressed refund public key');
  secp256k1.ProjectivePoint.fromHex(refundPublicKey).assertValidity();
  return { pairId: ARKADE_PAIR, offer, invoiceAmount: amountSat, refundPublicKey };
}
/** Metadata diagnostics only, never funding authorization. */
export function inspectCreateResponse(body: unknown, amountSat: number, now = Math.floor(Date.now()/1000)) {
  const r = body as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('Expected response object');
  if (r.error) return { verdict:'create_failed', error:typeof r.error === 'string' ? r.error : 'unknown_error', fundable:false };
  if (typeof r.id !== 'string' || !r.id) throw new Error('Missing swap id');
  if (typeof r.preimageHash !== 'string' || !/^[0-9a-f]{64}$/i.test(r.preimageHash)) throw new Error('Missing payment-hash binding');
  if (r.invoiceAmount !== amountSat) throw new Error('Recipient amount mismatch');
  if (!Number.isSafeInteger(r.expectedAmount) || Number(r.expectedAmount) < amountSat) throw new Error('Invalid funding amount');
  if (!Number.isSafeInteger(r.arkadeRefundLocktime) || Number(r.arkadeRefundLocktime)-now < 5400) throw new Error('Insufficient refund headroom');
  if (typeof r.address !== 'string' || !/^(ark|tark)1/.test(r.address)) throw new Error('Missing Arkade address');
  return { verdict:'maker_reported_offer_binding', fundable:false, recipientSat:amountSat,
    expectedAmount:r.expectedAmount, makerFeeDifferenceSat:Number(r.expectedAmount)-amountSat, paymentHash:r.preimageHash,
    remaining:['verify invoice/offer binding independently','derive and verify VHTLC and refund path','verify server identity and network','persist recovery material','approve before funding'] };
}
