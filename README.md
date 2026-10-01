# Universal BOLT12 (KaleidoPay)

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

## Where this code lives

**KaleidoPay** is the product name: the pay flow in the apps and the pitch. The libraries keep their names.

- **During the hackathon:** `universal-code` and `swap-market` stay here, as TypeScript imported from source. Rate maps them to this checkout (see `services/kaleidoPay/README.md` there), so a change here shows up in the app without a release. The format and the provider list will still change; this is not ready for a published SDK.
- **After the hackathon:** the protocol parts move into [swap-sdk](https://github.com/kaleidoswap/swap-sdk)'s Rust core, so the web app, extension, mobile and desktop share them:

| Piece | Destination |
|---|---|
| `universal-code`: payment codes, SSPS rails, route planning | swap-sdk core (it is SSPS protocol) |
| `swap-market`: Electrum swap providers over Nostr | swap-sdk, as another swap venue next to KaleidoSwap makers and the Arkade Intents corridor |
| KaleidoPay screens: pay button, progress, receipt | the apps (Rate, extension), on top of the SDK |
| Secret storage, Lightning payer (Bark, Spark) | the app or wallet-engine, passed in through `LightningPayer`, `SecretStore` and `AttemptStore` |

The interfaces (`LightningPayer`, `SecretStore`, `AttemptStore`, quote and attempt types) are meant to survive that move unchanged, so the port is a translation, not a redesign.

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
