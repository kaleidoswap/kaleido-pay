# KaleidoPay: how the pieces fit, and who owns what

Read this before touching KaleidoPay in Rate, the packages here, wallet-engine's Bark adapter or the signet nodes. If your change crosses a boundary below, agree it in this file first.

## Two flows

### Receive: one universal code

```
Rate (Receive)
  │ NWC request: make an offer with rails
  ▼
our ldk-server fork  ── Bolt12Receive { amount, description, ssps_rails } ──▶ lno1… with ssps_rails
  │
  ▼
Rate shows  bitcoin:<on-chain address>?amount=…&lno=<offer>     (BIP321)
```

- The offer comes from **our ldk-server fork** (branch `feat/offer-ssps-rails`), because only it can put `ssps_rails` inside the offer (LDK's offer HMAC covers experimental records, so rails cannot be added afterwards). Bark and Spark cannot issue offers.
- The app reaches that node over **NWC** (the NWC/BOLT12 track). The NWC request must carry the rails and end in `Bolt12Receive.ssps_rails`; a node without the fork must make the request fail, never silently drop the rails.
- **Rails list only what works today:** `ln:<network>` (the node) and `btc:<network>`. The `btc` rail is paid to the **BIP321 address**, not to an `ssps_lock`: no issuer answers invoice requests with `ssps_lock` yet. Add `arkade:<server>` or `bark:<server>` only once a payer can actually use them.
- Rail ids follow SSPS: full names (`ln:signet`, `btc:mutinynet`); custom signets are always named (`mutinynet`), because their chain hash is signet's.

### Pay: one Pay button

```
scan → universal-code (decode, plan) → KaleidoPay account → execute
                                          │
             ln rail, offer ──────────────┼──▶ Bark payLightningOffer           (direct)
             btc rail, address ───────────┴──▶ Electrum providers on Nostr       (swap)
                                                 swap-market: quote, both invoices from Bark,
                                                 verify script, claim to the address
```

- **Direct:** Bark pays the offer (`payLightningOffer`). wallet-engine does not expose it yet; Rate carries `patches/@kaleidorg__wallet-engine@1.0.0-beta.75.patch` until wallet-engine ships it.
- **Swap:** `packages/swap-market` finds Electrum swap providers on Nostr (kind 30315), agrees a reverse swap over NIP-04 (kind 25582), Bark pays the hold invoice and the prepayment together, and the claim pays the receiver's address. Mainnet providers answer; on test networks we run our own (`signet/electrum-provider`).
- Every quote includes Bark's own Lightning fee (`estimatePaymentFee`); no estimate, no quote.

## Ownership

| Piece | Where | Owner |
|---|---|---|
| SSPS spec | [kaleidoswap/ssps](https://github.com/kaleidoswap/ssps) (public) | Walter |
| `universal-code`: codec, BIP321, route planner | `packages/universal-code` | Walter (agents on request) |
| `swap-market`: Electrum providers over Nostr | `packages/swap-market` | Claude (this session) |
| Our swap providers and offer nodes | `signet/` | Claude |
| LDK forks (rails in offers) | rust-lightning, ldk-node, ldk-server, branch `feat/offer-ssps-rails` | Claude |
| KaleidoPay executor: Bark account, swap account, recovery | Rate `services/kaleidoPay/{bark,electrumSwapAccount,lightningPayer,recovery,storage}.ts` | Claude |
| KaleidoPay screens: Pay, provider choice, receipt, Receive | Rate `screens/`, `components/payments`, `components/receive` | Codex track |
| Universal offer over NWC (Receive) | Rate NWC client + the node's NWC side | NWC/BOLT12 track |
| Bark in wallet-engine and Rate | wallet-engine `BarkReactNativeAdapter`, Rate `services/protocols/bark.ts` | Mo |
| Electrum accelerator plugin | `electrum-accelerator/` | Mo |

## Interfaces between tracks

- **NWC → offer:** request `{ amount_sat, description, rails: string[] }`, response `{ offer: "lno1…" }`. The node side calls `Bolt12Receive` with `ssps_rails = JSON.stringify(rails)`.
- **Receive → Pay:** the code is BIP321 (`universal-code` `encodePaymentCode`), so a plain wallet still pays the address or the offer.
- **Bark → KaleidoPay:** `connectBarkToKaleidoPay(adapter, network)` registers one account with both routes; screens only call `quotePaymentOffers` / `executePaymentOffer`.
- **wallet-engine patch:** any change to `BarkReactNativeAdapter.sendPayment` must keep `lno1…` going to `payLightningOffer` until the patch is replaced by a release (`barkOffer.test.ts` in Rate guards it).
