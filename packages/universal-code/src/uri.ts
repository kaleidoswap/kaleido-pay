import { Address, NETWORK, TEST_NETWORK } from '@scure/btc-signer';
import { decodeOffer, acceptedRails } from './offer';
import type { Network } from './plan';

export interface PaymentCode { address?: string; offer?: string; amountSat?: number; label?: string; message?: string }
function check(code: PaymentCode, network: Network): void {
  if (!['mainnet', 'signet', 'mutinynet', 'testnet'].includes(network)) throw new Error('Invalid network');
  if (!code.address && !code.offer) throw new Error('No supported payment instruction');
  if (code.address) Address(network === 'mainnet' ? NETWORK : TEST_NETWORK).decode(code.address);
  if (code.offer) decodeOffer(code.offer);
  if (code.amountSat !== undefined && (!Number.isSafeInteger(code.amountSat) || code.amountSat <= 0 || code.amountSat > 2100000000000000)) throw new Error('Invalid satoshi amount');
}

/** A BIP321 subset: on-chain destination and/or BOLT12 offer. Network is supplied by the caller. */
export function encodePaymentCode(code: PaymentCode, network: Network): string {
  check(code, network);
  const params: [string, string][] = [];
  if (code.amountSat !== undefined) {
    const sat = BigInt(code.amountSat);
    params.push(['amount', `${sat / 100000000n}.${String(sat % 100000000n).padStart(8, '0')}`]);
  }
  if (code.offer) params.push(['lno', code.offer]);
  if (code.label !== undefined) params.push(['label', code.label]);
  if (code.message !== undefined) params.push(['message', code.message]);
  return `bitcoin:${code.address ?? ''}` + (params.length ? '?' + params.map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&') : '');
}

export function decodePaymentCode(input: string, network: Network): PaymentCode {
  if (input.length > 100000) throw new Error('Payment code too large');
  if (/^lno1/i.test(input)) { const code = { offer: input }; check(code, network); return code; }
  if (!/^bitcoin:/i.test(input) || input.includes('#')) throw new Error('Invalid payment URI');
  const body = input.slice(8), split = body.indexOf('?');
  const address = split < 0 ? body : body.slice(0, split);
  const params = new Map<string, string>();
  for (const part of (split < 0 ? '' : body.slice(split + 1)).split('&').filter(Boolean)) {
    const eq = part.indexOf('=');
    const key = decodeURIComponent(eq < 0 ? part : part.slice(0, eq)).toLowerCase();
    const value = decodeURIComponent(eq < 0 ? '' : part.slice(eq + 1));
    if (key.startsWith('req-')) throw new Error(`Unsupported required parameter: ${key}`);
    if (!['amount', 'lno', 'label', 'message', 'pop'].includes(key)) continue;
    if (params.has(key)) throw new Error(`Ambiguous duplicate parameter: ${key}`);
    params.set(key, value);
  }
  const code: PaymentCode = {};
  if (address) code.address = address;
  if (params.has('lno')) code.offer = params.get('lno');
  if (params.has('label')) code.label = params.get('label');
  if (params.has('message')) code.message = params.get('message');
  if (params.has('amount')) {
    const amount = params.get('amount')!;
    if (!/^\d+(?:\.\d{1,8})?$/.test(amount) || amount.length > 30) throw new Error('Invalid BTC amount');
    const [whole, fraction = ''] = amount.split('.');
    const sat = BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'));
    if (sat > 2100000000000000n || sat <= 0n) throw new Error('Invalid BTC amount');
    code.amountSat = Number(sat);
  }
  check(code, network);
  return code;
}

const CHAINS: Record<string, Network> = {
  '6fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000': 'mainnet',
  'f61eee3b63a380a477a063af32b2bbc97c9ff9f01f2c4225e973988108000000': 'signet',
  '43497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea330900000000': 'testnet',
};
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

/** The network a scanned code is for, or undefined when it cannot tell (a bare test-network address). */
export function paymentCodeNetwork(input: string): Network | undefined {
  const text = input.trim().replace(/^lightning:(\/\/)?/i, '');
  const query = /^bitcoin:([^?]*)(?:\?(.*))?$/i.exec(text);
  const offer = query ? new URLSearchParams(query[2] ?? '').get('lno') ?? undefined : /^lno1/i.test(text) ? text : undefined;
  if (offer) {
    const chains = decodeOffer(offer).find(f => f.type === 2n);
    if (!chains) return 'mainnet';
    if (chains.value.length !== 32) return undefined;
    const network = CHAINS[hex(chains.value)];
    // A custom signet shares signet's chain hash; its rails name it (SSPS §1.1).
    if (network === 'signet' && acceptedRails(offer).some(r => r.endsWith(':mutinynet'))) return 'mutinynet';
    return network;
  }
  const address = query?.[1] ?? '';
  return /^(bc1|[13])/i.test(address) ? 'mainnet' : undefined;
}
