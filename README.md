# Universal BOLT12

**Pay with what you have. Receive what you want.**

bitcoin++ Berlin hackathon, 1–3 October 2026. Team: Walter, Mo.

The receiver shares one code listing the rails they accept (on-chain, Lightning, Bark, Arkade, Liquid). The payer presses one Pay button: the wallet pays directly on a shared rail, or runs the swap inside the payment through a provider found on Nostr, locked on one hash.

| Folder | What | Owner |
|---|---|---|
| `packages/swap-market` | Client for Electrum's swap providers over Nostr: discover, request, verify, claim | Walter |
| `packages/universal-code` | Universal code: BOLT12 offer with the SSPS rails TLV, BIP321 fallback, route planner | Walter |
| `signet/` | ldk-node on signet issuing universal offers | Walter |
| `electrum-accelerator/` | Electrum plugin: accelerate stuck transactions and swap claims via mempool's accelerator | Mo |
| `demo/` | Command-line demo scripts | Walter |
| `docs/` | One-pager, demo script, pitch notes | Walter |

The wallet side (Bark account, Pay and Receive screens) lives in [kaleidoswap/Rate](https://github.com/kaleidoswap/Rate) on branch `hack/universal-bolt12` and imports the packages from here.

## Quick start

```bash
npm install
npm test                                              # offline checks
npm run offers -w @universal-bolt12/swap-market mainnet   # live providers on Nostr
```

## Status

- [x] swap-market: offers, Nostr requests and every reply check verified against 3 live mainnet providers; claim transaction verified against an independent library
- [ ] First paid swap (needs Bark `payInvoices` from Rate)
- [ ] Universal code encode/decode
- [ ] Signet ldk-node issuing universal offers
- [ ] Electrum accelerator plugin

## Built during the hackathon

Everything in this repository was written during the event. Rate and the KaleidoSwap maker existed before; see their branches for hackathon changes.
