# KaleidoPay universal code

Payment-code helpers and capability routing for the Berlin hackathon. No network
calls, wallet keys, invoice signing or fund movement. Public functions are exported
from `src/index.ts`; the package follows this workspace's TypeScript-source convention.

## Rate integration

```ts
import {
  acceptedRails, decodePaymentCode, planPayment,
} from '@universal-bolt12/universal-code';

const code = decodePaymentCode(scannedText, 'signet');
// First ask the Lightning stack to validate the offer, chain and supported features.
// Persist a local request ID separately; a reusable offer is not a payment attempt ID.
const request = {
  id: 'local-request-123',
  network: 'signet' as const,
  amountSat: code.amountSat ?? userSelectedAmountSat,
  acceptedRails: [
    ...(code.address ? ['btc:signet'] : []),
    ...(code.offer ? acceptedRails(code.offer) : []),
  ].filter((rail, index, rails) => rails.indexOf(rail) === index),
};
const plan = planPayment(request, [
  { id: 'bark-account', rail: 'ark:SERVER_XONLY_PUBKEY', network: 'signet' },
], [
  // Register only after this composite executor is actually available in Rate.
  { id: 'bark-electrum', from: 'ark:SERVER_XONLY_PUBKEY', to: 'btc:signet', network: 'signet' },
]);
```

A `ready` result is a capability match, not authorization or a payable quote. The
caller resolves the destination from the payment code or an authenticated invoice,
requests a live quote, checks balances and fees, gets approval, securely persists
an attempt, then invokes the executor. Do not automatically pay or retry because
planning succeeded. `amountSat` is the requested BTC amount; pricing non-BTC assets
is outside this version. Liquid and RGB rail IDs can be transported but conversion
and execution are not provided here.

`planPayment` returns a direct route first, then explicitly supplied single-swap
capabilities. Within each group it preserves recipient preference, source order,
and capability order. It does not discover providers or infer that Bark's Lightning
support exists. A Bark→Lightning→Electrum route may be registered as one composite
capability only when its executor is integrated. `ln` resolves against the explicit
request network. Signet, Mutinynet, testnet and mainnet never match each other.
Ark server identity must be supplied in the rail ID and verified by the caller.

## BOLT12 / SSPS

```ts
const extendedOffer = withAcceptedRails(issuerOffer, ['btc:signet', 'ln']);
const code = encodePaymentCode({ offer: extendedOffer, amountSat: 50000 }, 'signet');
```

`decodeOffer` and `encodeOffer` implement the BOLT12 checksumless bech32-style
encoding and canonical BigSize TLV framing. They preserve unknown offer fields,
check ordering, bounds and offer type ranges, and accept uppercase and continuation
formatting. `withAcceptedRails` replaces experimental odd field `1000000385` with
UTF-8 JSON of a string array (canonical for this restricted value type).
`acceptedRails` appends implicit `ln` if absent, following SSPS §5.3.

These helpers are **structural codecs, not complete BOLT12 validators**. They do
not validate issuer keys, blinded paths, required fields, feature bits, chain
hashes, offer amount or offer expiry. Run the Lightning implementation's full
validation before negotiating or paying. `validateRequest` validates the caller's
normalized request, not these embedded offer semantics. The invoice_request and
signed invoice / `ssps_lock` flows remain the issuer and wallet's responsibility.

Only an issuer should call `withAcceptedRails`: it changes the offer ID. The issuer
must register/serve the modified offer and support its fields. Modifying somebody
else's offer is not an integration. No live issuer interoperability is claimed yet.

## BIP321 subset

`encodePaymentCode` / `decodePaymentCode` support an on-chain address, `lno`, BTC
`amount`, UTF-8 `label` and `message`. Amount conversion uses integer arithmetic.
The network is supplied externally: test networks share address encodings, so the
URI cannot distinguish signet from Mutinynet. Offer chains must be checked by the
Lightning stack; the URI decoder does not establish their network.

Unknown optional parameters are ignored; every unknown `req-` parameter is rejected.
Repeated supported instruction keys are rejected as ambiguous in this subset,
although BIP321 allows multiple payment instructions. BOLT11, silent payments and
proof-of-payment callbacks are not implemented. Optional `pop` is ignored and never
opened. Raw BOLT12 offers are accepted; raw on-chain addresses are not.

Request IDs, expiry and attempt IDs are local metadata, not serialized into this
standard URI. `PaymentRequest.expiresAt` is Unix seconds and is enforced when set.
A receive URI containing an on-chain address should be used for a single request.

## Validation

Run `npm test` from the repository root. Tests include malformed and noncanonical
TLVs, unknown-field preservation, URI ambiguity, exact amounts, network mismatch,
expiry, direct preference and explicit composite-route gating. No live requests
or payments are made.

Sources: [BOLT12](https://github.com/lightning/bolts/blob/master/12-offer-encoding.md),
[BIP321](https://github.com/bitcoin/bips/blob/master/bip-0321.mediawiki), and the local
`ssps/ssps.md` §5.3. Experimental field numbers follow SSPS §5.3.

