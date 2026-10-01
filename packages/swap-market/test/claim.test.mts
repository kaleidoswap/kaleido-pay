import { Transaction } from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { buildClaimTx } from '../src/index';
const priv = secp256k1.utils.randomPrivateKey(); const pub = secp256k1.getPublicKey(priv, true);
const pre = new Uint8Array(32).fill(7); const h = ripemd160(sha256(pre));
const refund = secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey(), true);
const lt = 969533; const ltb = [lt & 255, (lt >> 8) & 255, (lt >> 16) & 255];
const script = new Uint8Array([0x82,0x01,0x20,0x87,0x63,0xa9,0x14,...h,0x88,0x21,...pub,0x67,0x75,0x03,...ltb,0xb1,0x75,0x21,...refund,0x68,0xac]);
const c = buildClaimTx({ txid: 'ab'.repeat(32), vout: 1, amount: 25000, redeemScript: bytesToHex(script), preimage: bytesToHex(pre), claimPrivkey: bytesToHex(priv), destination: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', feeRate: 3, network: 'mainnet' });
const tx = Transaction.fromRaw(hexToBytes(c.hex), { allowUnknownOutputs: true, disableScriptCheck: true });
const sighash = tx.preimageWitnessV0(0, script, 1, 25000n);
const w = tx.getInput(0).finalScriptWitness!;
const sig = secp256k1.Signature.fromDER(w[0].slice(0, -1));
if (tx.id !== c.txid || !secp256k1.verify(sig, sighash, pub)) { console.error('FAIL'); process.exit(1); }
console.log('txid match', tx.id === c.txid, 'fee', c.fee, 'vsize', tx.vsize, 'sig valid', secp256k1.verify(sig, sighash, pub), 'witness items', w.length);
