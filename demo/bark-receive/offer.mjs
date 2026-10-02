import {createHash} from 'node:crypto';
import {decodeOffer} from '../../packages/universal-code/src/offer.ts';

const MAINNET = '6fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d619000000000000';
const hash = value => createHash('sha256').update(value).digest('hex');
const uint = bytes => {
 if(bytes.length>8 || (bytes.length>0 && bytes[0]===0))throw Error('Noncanonical offer integer');
 return bytes.reduce((n,b)=>(n<<8n)|BigInt(b),0n);
};
/** Conservative demo preflight; Bark remains responsible for protocol validation. */
export function reviewOffer(input,amountSats,now=Math.floor(Date.now()/1000)) {
 const offer=input.trim().replace(/^lightning:(\/\/)?/i,'');
 const fields=decodeOffer(offer), get=t=>fields.find(f=>f.type===t)?.value;
 if(!Number.isSafeInteger(amountSats)||amountSats<=0)throw Error('A positive whole-satoshi amount is required');
 if(get(6n))throw Error('Currency-denominated offers are outside this demo');
 const chains=get(2n);
 if(chains && (chains.length!==32 || Buffer.from(chains).toString('hex')!==MAINNET))throw Error('Demo requires a Bitcoin mainnet offer');
 const amount=get(8n);
 if(amount && uint(amount)!==BigInt(amountSats)*1000n)throw Error('Offer amount differs from requested demo amount');
 const expiry=get(14n);
 if(expiry && uint(expiry)<=BigInt(now+120))throw Error('Offer expires too soon');
 if(get(20n))throw Error('Quantity offers are outside this demo');
 if(!get(16n) && !get(22n))throw Error('Offer has no recipient path or issuer');
 const canonical=offer.toLowerCase().replace(/\+\s*/g,'');
 return {offer:canonical,offerFingerprint:hash(canonical),amountSats,network:'bitcoin',protocolValidated:false};
}
/** Never persist or print the payment preimage. */
export function paymentEvidence(review,result) {
 if(result.type!=='paid')return {offerFingerprint:review.offerFingerprint,amountSats:review.amountSats,status:result.type==='inProgress'?'pending':'unknown'};
 if(!/^[a-f0-9]{64}$/i.test(result.payment_hash??'') || !/^[a-f0-9]{64}$/i.test(result.preimage??'') || hash(Buffer.from(result.preimage,'hex'))!==result.payment_hash.toLowerCase())throw Error('Invalid payment proof');
 return {offerFingerprint:review.offerFingerprint,amountSats:review.amountSats,status:'paid',paymentHash:result.payment_hash.toLowerCase()};
}
export function verifyRepeatedOffer(rows) {
 if(rows.length!==2 || rows.some(r=>r.status!=='paid'||!/^[a-f0-9]{64}$/.test(r.paymentHash??'')||!Number.isSafeInteger(r.amountSats)||r.amountSats<=0))throw Error('Two proven payments required');
 if(!rows[0].offerFingerprint || rows[0].offerFingerprint!==rows[1].offerFingerprint)throw Error('Payments used different offers');
 if(rows[0].paymentHash===rows[1].paymentHash)throw Error('Same payment recorded twice');
 return {sameOffer:true,distinctPayments:2,totalRecipientSats:rows.reduce((n,r)=>n+r.amountSats,0)};
}
