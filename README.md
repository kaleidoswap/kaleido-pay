# KaleidoPay

**Pay with what you have. Receive what you want.**

One reusable BOLT12 QR says which layers the receiver accepts, in order: Bark, Arkade, Lightning, on-chain. The payer's wallet reads it and quotes every route it can pay, directly or through a swap provider found on Nostr. Any other BOLT12 wallet still sees a normal offer.

Built at bitcoin++ Berlin, 1–3 October 2026, by Walter and Mo.

**Site, videos and slides:** https://kaleidoswap.github.io/kaleido-pay/

## How it works

- **Receiver:** in Rate, connect your LDK node over Nostr Wallet Connect, pick and order the layers you accept, and your node issues one reusable BOLT12 offer carrying that order in an `ssps_rails` record (SSPS §5.3, type `1000000385`). Bark and Arkade entries carry your address; an on-chain address travels next to the offer in a BIP321 link.
- **Payer:** scan. KaleidoPay shows the receiver's order and quotes every route, fees included: Bark to their Bark address, the offer over Lightning, Bark's on-chain send, or an Electrum swap provider found on Nostr. You pick; nothing moves until you confirm.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/bolt12.md](docs/bolt12.md).

## This repository

| Folder | What |
|---|---|
| `packages/universal-code` | The rails record codec, BIP321 + offer, network detection, route planner |
| `packages/swap-market` | Client for Electrum's swap providers over Nostr: discover, quote, reverse swap, claim, recovery |
| `signet/` | Our offer nodes (LDK fork) and Electrum swap providers on signet and Mutinynet |
| `demo/` | Command-line demos, the offer inspector, and the demo videos |
| `site/` | The GitHub Pages site and slides |

The app lives in [kaleidoswap/Rate](https://github.com/kaleidoswap/Rate/tree/hack/universal-bolt12) (branch `hack/universal-bolt12`), which imports the packages from here. The LDK changes are on branch `feat/offer-ssps-rails` of our forks of [rust-lightning](https://github.com/kaleidoswap/rust-lightning/tree/feat/offer-ssps-rails), [ldk-node](https://github.com/kaleidoswap/ldk-node/tree/feat/offer-ssps-rails) and [ldk-server](https://github.com/kaleidoswap/ldk-server/tree/feat/offer-ssps-rails). The spec is [kaleidoswap/ssps](https://github.com/kaleidoswap/ssps).

## Quick start

```bash
npm install
npm test                                                  # offline checks
npm run offers -w @universal-bolt12/swap-market mainnet   # live swap providers on Nostr
npm run offer -- --decode lno1...                         # read an offer's rails
```

## Status

Proven:
- Scan → receiver's order → live quotes for every route, on mainnet in Rate (quotes only).
- The LDK fork issues offers with the receiver's rails over encrypted NWC (regtest, and signet with a real node); a wallet that doesn't know the record still pays the offer.
- Electrum swaps over Nostr fully paid and claimed on Mutinynet (24 s and 19 s) with our own provider.
- Bark pays Lightning and Arkade receives Lightning on mainnet (small amounts).

Not yet:
- A complete payment from Bark through an enriched QR end to end.
- Arkade paying an Arkade address directly (needs a fee estimate from the wallet library).
- A per-payment lock (`ssps_lock`) from the receiver instead of a static address.

## Built at the hackathon

Everything in this repository was written during the event, as were the LDK fork branches, Bark support in wallet-engine and Rate, and KaleidoPay in Rate. Rate, wallet-engine and the SSPS drafts existed before.

## License

MIT
