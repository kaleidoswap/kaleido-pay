# Universal BOLT12

One BOLT12 offer that also says which rails its issuer accepts. A wallet that knows nothing about it pays a normal Lightning offer; a wallet that reads it can pay on another rail, directly or through a swap provider.

Spec: [SSPS §5.3 "Rails in an offer"](https://github.com/kaleidoswap/ssps/blob/main/ssps.md#53-rails-in-an-offer).

## The record

| Stream | Type | Value |
|---|---|---|
| offer | `1000000385` | `ssps_rails`: JSON array of accepted rail ids, most preferred first, e.g. `["btc:mutinynet","ln:mutinynet"]` |
| invoice_request | `2000000385` | `ssps_rail`: the rail the payer chose and its refund key |
| invoice | `3000000385` | `ssps_lock`: the lock the payer funds on that rail, signed with the invoice |

All three are odd and in BOLT12's experimental ranges, so other implementations ignore them.

## What we had to change in LDK

LDK recognises its own offers statelessly: the offer metadata is an HMAC over the offer's records, **experimental records included**. A rails record added to an offer after the node issued it therefore makes every invoice request fail; the node has to issue the offer with the record inside.

We added that to our forks, branch `feat/offer-ssps-rails` in each:

| Repo | Commit | Change |
|---|---|---|
| [kaleidoswap/rust-lightning](https://github.com/kaleidoswap/rust-lightning/tree/feat/offer-ssps-rails) | `55583cc` | `OfferBuilder::ssps_rails`, `Offer::ssps_rails`; the record is covered by the offer metadata. Test: an issued offer survives parsing and its invoice requests verify; rails appended afterwards are rejected |
| [kaleidoswap/ldk-node](https://github.com/kaleidoswap/ldk-node/tree/feat/offer-ssps-rails) | `41f1172` | `Bolt12Payment::receive_with_ssps_rails` |
| [kaleidoswap/ldk-server](https://github.com/kaleidoswap/ldk-server/tree/feat/offer-ssps-rails) | `44f3b4d` | `ssps_rails` on `Bolt12Receive`, CLI `--ssps-rails`. End-to-end test with real bitcoind and ldk-server processes: a payer unaware of the record pays the offer and both sides see it settle |

## Live offers

Our ldk-server fork runs on signet and Mutinynet (`signet/ldk-node`). Issue and decode one:

```bash
npm run offer -- --network mutinynet --amount 5000          # rails default to btc:<net>,ln:<net>
npm run offer -- --network signet --rails btc:signet,ln
npm run offer -- --decode lno1...
```

Signet, 5,000 sat, rails `["btc:signet","ln"]`, reachable through signet.coinbin.org:

```
lno1qgs0v8hw8d368q9yw7sx8tejk2aujlyll8cp7tzzyh5h8xyppqqqqqqgqdxyksq2rf9kzmr9d9jx75rp0ys82mnfwejhyumpdssx7enxv4epp6qrc094yuxl3ldher97f9jrppchrrx8369hs8ye5v9fyxn8g0p7ql4sxm0a42jsaw023a3w62hld53d695vjr9pz76kw7crdq7nwqjcksvnqgpchc9axp35u5ypk90fmwdrrt5rq768tsss6scwj64y7m3ke2qz3rgqxw6xxphu5rwg76ptx4hqzqtl3t0l7hpvj9ykvzaz5nn3nt0xnnxee76696xwhkspap0kc303vamvqzuyfscq95v526xwpquw53f7u02x7we7ewxwmcuqupng5y0cvpm0xsvx4a4fqqkfzfth37gckzfvctfnay3e5dwtnqwq9y6hl4ura9ys7ghk5e8nwkrqu4qaxgrf32626qlx5utzzqmdd5eygnyp359ah59l2p2h4lx66amtlsmcjete57paq24xrhxpqtlrhxktsyf4kgnzw33n5umfvahx2apz9s3xcm3zt5
```

The node runs on a laptop for the hackathon; when it is offline the offer cannot be paid.

## How a payer handles it

1. Decode the offer (`packages/universal-code`: `decodeOffer`, `acceptedRails`).
2. Shared rail? Pay directly: `ln` is a normal BOLT12 payment. In Rate, Bark pays it (`payLightningOffer`), with Bark's fee in the quote.
3. No shared rail? Build a route that ends on a listed rail through a swap provider. Today that is Lightning → on-chain through Electrum's swap providers on Nostr (`packages/swap-market`), proven on Mutinynet.

## Not done yet

- The issuer answering an invoice request for an on-chain rail with an `ssps_lock`, so a payer can lock on-chain without Lightning.
- Bark paying offers ships in Rate through a small wallet-engine patch (`patches/@kaleidorg__wallet-engine@1.0.0-beta.75.patch` on Rate's `hack/universal-bolt12`); it should move into wallet-engine itself. Not yet run on a device.
- Upstreaming the record as a bLIP.
