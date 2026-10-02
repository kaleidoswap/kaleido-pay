# Local BOLT12 offer inspector

From the repository root:

```sh
npm ci
npm ci --prefix demo/decoder
npm start --prefix demo/decoder
```

Open http://127.0.0.1:4178. Set PORT to choose another local port.
The server binds only to loopback and serves two resources: the page and a
browser bundle. Decoding happens in the browser, reusing universal-code's
structural offer decoder. No offer is posted, logged or stored. No CDN is used;
Content Security Policy blocks network connections from the page.

Accepts lno1 offers, lightning: wrappers and BIP321 links containing lno.
Displays standard field names, opaque offer_metadata bytes, exact amounts,
SSPS rails, unknown TLVs, raw hex and JSON. Invalid custom values remain visible
as bytes with a warning. Does not decode lni/lnr messages, validate signatures,
resolve invoices, or determine payment availability. The synthetic example is
explicitly not payable. A BIP321 wrapper's address, amount, label and message are shown but not validated.

Metadata distinction:
- Standard field 4, offer_metadata, is opaque issuer data; it is not a generic
  editable application JSON field.
- SSPS field 1000000385 carries accepted rails. It must be emitted by the
  supporting node; the standard NWC merchant bridge does not yet pass this
  extension to the issuer.
- Request 2000000385 and invoice 3000000385 belong to other BOLT12 messages,
  not to the lno offer inspected by this page.

Run `npm test --prefix demo/decoder`. Tests cover amount/metadata/rails,
wrappers, unknown fields, malformed extension values and invalid inputs.

The example is the BIP321 link Rate's Reusable payment QR produces: a reusable (amountless) mainnet offer whose `ssps_rails` lists Arkade then Bark, each with the real public server key of arkade.computer / ark.second.tech, then `btc:mainnet` and `ln:mainnet`, beside an on-chain address. Every address is a placeholder and cannot be paid. The inspector shows the BIP321 address for the `btc` rail, the network, and which known public server an Ark rail's key matches (keys read from the servers on 2026-10-02; a server can rotate its key). This is shape decoding, not SDK validation.

## Hackathon landing page

The page includes a judge walkthrough, public Rate source/docs links and a distinction between regtest enriched issuance and separate mainnet SDK transfer tests. The universal-bolt12 repository is currently private; do not use its URL as the only judge-facing link.

Run `npm run build --prefix demo/decoder` to generate a static site in `demo/decoder/dist/`. Host that directory with any static hosting service. The bundle contains the explainer and browser-only inspector, not wallet credentials or a payment service. A localhost address is not a public demo link. No hosted demo or video URL has been created by this build.
