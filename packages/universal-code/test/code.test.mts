import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bech32 } from '@scure/base';
import { encodeOffer, decodeOffer, withAcceptedRails, acceptedRails, SSPS_RAILS, encodePaymentCode, decodePaymentCode, planPayment, validateRequest } from '../src/index.ts';

const fields = [{ type: 10n, value: new TextEncoder().encode('KaleidoPay') }, { type: 79n, value: Uint8Array.of(1,2,3) }];
const offer = encodeOffer(fields);
const request = { id: 'coffee-1', network: 'signet' as const, amountSat: 50000, acceptedRails: ['btc:signet', 'ln'], expiresAt: 2000 };
const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const raw = (bytes: number[]) => 'lno1' + bech32.toWords(Uint8Array.from(bytes)).map(n => alphabet[n]).join('');

test('offer preserves unknown fields, case and continuation', () => {
  assert.deepEqual(decodeOffer(offer), fields);
  assert.deepEqual(decodeOffer(offer.toUpperCase()), fields);
  assert.deepEqual(decodeOffer(offer.slice(0,10) + '+\n ' + offer.slice(10)), fields);
  assert.throws(() => decodeOffer('L' + offer.slice(1)), /Mixed/);
});
test('SSPS field roundtrip preserves preference and default LN', () => {
  const extended = withAcceptedRails(offer, ['btc:signet']);
  assert.deepEqual(acceptedRails(extended), ['btc:signet', 'ln']);
  assert.deepEqual(decodeOffer(extended).filter(f => f.type !== SSPS_RAILS), fields);
  assert.deepEqual(acceptedRails(withAcceptedRails(extended, ['ln', 'btc:signet'])), ['ln', 'btc:signet']);
  assert.deepEqual(acceptedRails(withAcceptedRails(extended, ['btc:mutinynet', 'ln:mutinynet'])), ['btc:mutinynet', 'ln:mutinynet']);
  assert.deepEqual(acceptedRails(withAcceptedRails(extended, ['btc:signet'])), ['btc:signet', 'ln']);
  assert.throws(() => withAcceptedRails(offer, ['ln','ln']), /Duplicate/);
});
test('reject malformed TLVs and encoding', () => {
  for (const bytes of [[253,0,10,0], [10,3,1], [10,0,10,0], [10,0,9,0], [80,0], [255,0]]) assert.throws(() => decodeOffer(raw(bytes)));
  for (const code of ['lno1', offer + '+', 'lno1!', offer + 'Q']) assert.throws(() => decodeOffer(code));
  assert.throws(() => encodeOffer([...fields, fields[0]]), /Duplicate/);
});
test('BIP321 amounts and UTF8 roundtrip without float rounding', () => {
  const code = { offer, amountSat: 1, label: 'Café + Berlin', message: 'A&B = coffee' };
  assert.deepEqual(decodePaymentCode(encodePaymentCode(code, 'signet'), 'signet'), code);
  assert.equal(decodePaymentCode(`BITCOIN:?LNO=${offer}&AMOUNT=0.00000001`, 'signet').amountSat, 1);
  assert.deepEqual(decodePaymentCode(offer, 'signet'), { offer });
});
test('reject URI ambiguity, precision loss, required extension and bad addresses', () => {
  for (const suffix of ['&amount=1&AMOUNT=2', '&amount=0.000000001', '&amount=1e2', '&amount=-1', '&amount=21000001', '&req-pop=foo', '&label=a&LABEL=b', '&label=%zz']) {
    assert.throws(() => decodePaymentCode(`bitcoin:?lno=${offer}${suffix}`, 'signet'));
  }
  assert.throws(() => decodePaymentCode('bitcoin:notAnAddress', 'signet'));
  assert.throws(() => decodePaymentCode('bitcoin:?lightning=unsupported', 'signet'));
  assert.deepEqual(decodePaymentCode(`bitcoin:?lno=${offer}&future=a&future=b`, 'signet'), { offer });
});
test('direct route preferred over swap to more preferred recipient rail', () => {
  const result = planPayment(request, [{ id:'wallet', rail:'ln', network:'signet' }], [{id:'provider', from:'ln', to:'btc:signet', network:'signet'}], 1000);
  assert.equal(result.status, 'ready');
  if (result.status === 'ready') { assert.equal(result.route.kind, 'direct'); assert.equal(result.alternatives[0].kind, 'swap'); }
});
test('only explicit same-network swap capabilities may route Bark', () => {
  const sources = [{ id:'bark', rail:'ark:server', network:'signet' as const }];
  assert.equal(planPayment(request, sources, [], 1000).status, 'unsupported');
  const result = planPayment(request, sources, [{id:'bark-electrum', from:'ark:server', to:'btc:signet', network:'signet'}], 1000);
  assert.equal(result.status, 'ready');
  assert.equal(planPayment(request, [{ ...sources[0], network:'mutinynet' }], [], 1000).status, 'unsupported');
});
test('reject expired requests, invalid amounts and contradictory networks', () => {
  assert.throws(() => validateRequest(request, 2000), /expired/);
  for (const amountSat of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.throws(() => validateRequest({...request, amountSat}, 1000));
  assert.throws(() => validateRequest({...request, acceptedRails:['btc:mainnet']}, 1000), /network/);
});
test('rails carry Bark and Arkade addresses in preference order, Lightning implicit', async () => {
  const { offerRails, encodeRails } = await import('../src/index.ts');
  const bark = 'bark:' + 'b'.repeat(64), arkade = 'arkade:' + 'a'.repeat(64);
  const extended = withAcceptedRails(offer, [{ rail: bark, address: 'tark1barkaddress' }, 'btc:mainnet', { rail: arkade, address: 'ark1arkadeaddress' }]);
  assert.deepEqual(offerRails(extended), [{ rail: bark, address: 'tark1barkaddress' }, { rail: 'btc:mainnet' }, { rail: arkade, address: 'ark1arkadeaddress' }, { rail: 'ln' }]);
  assert.deepEqual(acceptedRails(extended), [bark, 'btc:mainnet', arkade, 'ln']);
  assert.equal(new TextDecoder().decode(encodeRails([{ address: 'tark1x', rail: bark } as any])), `[{"address":"tark1x","rail":"${bark}"}]`);
  assert.deepEqual(offerRails(offer), [{ rail: 'ln' }]);
  for (const bad of [[], [{ rail: 'btc:mainnet', address: 'bc1q' }], [{ rail: 'bark:zz', address: 'tark1' }], [{ rail: bark }], [{ rail: bark, address: 'TARK1' }],
    [{ rail: bark, address: 'tark1', extra: 1 }], [bark, { rail: bark, address: 'tark1' }]]) {
    assert.throws(() => withAcceptedRails(offer, bad as any));
  }
});
test('network comes from the offer chain or the address', async () => {
  const { paymentCodeNetwork } = await import('../src/index.ts');
  const chain = (h: string) => ({ type: 2n, value: Uint8Array.from(h.match(/../g)!.map(x => parseInt(x, 16))) });
  const signet = 'f61eee3b63a380a477a063af32b2bbc97c9ff9f01f2c4225e973988108000000';
  assert.equal(paymentCodeNetwork(offer), 'mainnet');
  assert.equal(paymentCodeNetwork(encodeOffer([chain(signet), ...fields])), 'signet');
  assert.equal(paymentCodeNetwork(withAcceptedRails(encodeOffer([chain(signet), ...fields]), ['btc:mutinynet', 'ln:mutinynet'])), 'mutinynet');
  assert.equal(paymentCodeNetwork(`lightning:${encodeOffer([chain(signet), ...fields])}`), 'signet');
  assert.equal(paymentCodeNetwork(`bitcoin:tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx?lno=${encodeOffer([chain(signet), ...fields])}`), 'signet');
  assert.equal(paymentCodeNetwork('bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.0001'), 'mainnet');
  assert.equal(paymentCodeNetwork('bitcoin:tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'), undefined);
});
