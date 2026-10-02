# Ordered destinations and the SSPS boundary

## Implemented experiment

`kaleidopay_destinations` is provisional odd offer TLV **1000000387**. This number is a local experiment, not a registered BOLT/SSPS allocation: check allocation and coordinate before public interoperability. Unsupported wallets may ignore it and use the ordinary Lightning offer. `offer_metadata` stays opaque issuer data; `ssps_rails` stays an ordered string array.

Version 1 contains an explicit network and destinations in receiver preference order:

```json
{
  "destinations": [
    {"address": "EXAMPLE_ARKADE_NOT_PAYABLE", "server": "https://arkade.example/", "type": "arkade"},
    {"address": "EXAMPLE_BARK_NOT_PAYABLE", "server": "https://bark.example/", "type": "bark"},
    {"source": "bolt12_offer", "type": "lightning"}
  ],
  "network": "mainnet",
  "version": 1
}
```

These are illustrative strings, not payment addresses. The codec checks shape, bounds, duplicate destinations and explicit network matching; only a native SDK can verify the actual address/network/server combination. A server URL is a locator, not authenticated cryptographic identity. Version 1 requires canonical HTTPS URLs without credentials, query or fragment. The decoder must never fetch a supplied URL automatically.

Encoding uses compact UTF-8 JSON with sorted object keys and unchanged array order. The decoder requires that canonical encoding, rejects unknown fields/versions and caps metadata at 8192 bytes and 16 destinations. This is deliberately narrower than accepting arbitrary JSON. `orderedDestinations` appends Lightning if absent; an explicit Lightning entry keeps its position. An absent extension means ordinary offer behavior. An invalid extension must never yield a partial alternative destination list.

`withDestinations` is for issuer construction only. Adding it to a live offer changes the offer identity and can invalidate LDK's registration/HMAC. The current NWC service and node issuer do not yet expose this field. Production issuance requires node support, capability negotiation and a round-trip payment test against the registered offer.

## SSPS review

Keep `ssps_rails` for SSPS capability negotiation. Its string-array format already expresses rail preference. Replacing strings with address objects would break readers and conflate a reusable endpoint with a per-payment lock. In the current SSPS draft, `ark:<server-key>` describes Arkade VHTLC.ScriptV2; it must not silently mean Bark as well.

The SSPS flow selects a rail in `ssps_rail` on the invoice request and receives a signed `ssps_lock` on the invoice, tied to the payment hash, amount, deadline and refund conditions. Static Bark/Arkade addresses provide none of these guarantees. The destination extension is therefore useful for direct payments and provider-based route discovery; it does not implement SSPS settlement or atomicity. Do not derive `ssps_rails` automatically from destination types.

For the hackathon, show the ordered destination list and ordinary BOLT12 fallback. Advertise SSPS rails only when the corresponding negotiated lock flow is implemented. The existing BTC/BIP321 flow must continue to be labelled address payment, not signed SSPS-lock settlement.

## Planning and execution contract

`planPayment` accepts `preference: 'recipient-first'` to rank explicit rail capabilities by receiver preference, with direct routes first within the same rail. The legacy default remains `direct-first`. This plans capabilities, not a fee-approved payment. Missing capabilities fall through to the next rail.

Destination metadata is not automatically mapped into planner rails: an executor must first validate each endpoint with the correct SDK and bind the exact endpoint to its quote. Two addresses sharing a rail must never collapse to an arbitrary recipient. A later adapter should carry the destination index and full endpoint in the validated quote, then recheck it on execution. Network is an explicit expectation, not inferred from an Ark address prefix; where possible it must also agree with the offer's chain constraints.

Preference does not authorize higher fees or automatic retries after an uncertain payment. The sender must receive a verified quote, enforce its fee limit, and use existing recovery logic. Static addresses and server URLs in a reusable QR expose correlation information; never include credentials or private wallet state.

## Remaining owner handoffs

1. Issuer: accept and validate the canonical extension before constructing/registering the offer; return an error if unsupported.
2. NWC: advertise support and forward the exact envelope; do not silently discard it.
3. Wallet adapter: verify endpoints and server identity using Arkade/Bark SDKs and preserve exact destination binding in quotes.
4. Rate: show receiver order, chosen endpoint, amount and fee before payment; retain LN fallback.
5. Interoperability: test unaware wallets and repeated payments to the same registered offer; agree the extension allocation before release.

References: [BOLT12](https://github.com/lightning/bolts/blob/master/12-offer-encoding.md), [SSPS draft](https://github.com/kaleidoswap/ssps/blob/main/ssps.md), local source `../ssps/ssps.md` reviewed for this change.
