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
explicitly not payable. A BIP321 wrapper's other fields are not validated here.

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

The example's `ssps_rails` lists a Bark and an Arkade rail with addresses, then on-chain; Lightning is implicit. Example addresses are deliberately not payable. This is shape decoding, not SDK validation.
