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
- The app reaches that node over **NWC** (Codex). The NWC request must carry the rails and end in `Bolt12Receive.ssps_rails`; a node without the fork must make the request fail, never silently drop the rails.
- **One record, the receiver's order.** `ssps_rails` (offer TLV 1000000385) lists where the receiver wants money, most preferred first. An entry is a rail id (`btc:mainnet`, `ln:mainnet`) or a Bark/Arkade rail with the receiver's address, which a payer on the same server pays directly: `{"rail":"bark:<server x-only key>","address":"ark1…"}`. Lightning is always accepted, last unless listed. Build it with `universal-code` `encodeRails` (JCS JSON); never add it to an issued offer. The `btc` rail is paid to the **BIP321 address** (no issuer answers with `ssps_lock` yet).
- Rail ids follow SSPS: full names (`ln:signet`, `btc:mutinynet`); custom signets are always named (`mutinynet`), because their chain hash is signet's.

### Pay: one Pay button

```
scan → universal-code (decode, plan) → KaleidoPay account → execute
                                          │
             bark rail, address ──────────┬──▶ Bark sendArkPayment              (direct)
             ln rail, offer ──────────────┼──▶ Bark payLightningOffer           (direct)
             btc rail, address ───────────┴──▶ Electrum providers on Nostr       (swap)
                                                 swap-market: quote, both invoices from Bark,
                                                 verify script, claim to the address
```

- **Direct, receiver's Bark address:** when the offer lists `bark:<key>` with an address and the payer's Bark wallet is on that server (`getConnectionInfo().nodeId`), Bark pays the address (`sendArkPayment`), quoted with `estimatePaymentFee('ark')`.
- **Direct, Lightning:** Bark pays the offer (`payLightningOffer`). wallet-engine does not expose it yet; Rate carries `patches/@kaleidorg__wallet-engine@1.0.0-beta.75.patch` until [wallet-engine#119](https://github.com/kaleidoswap/wallet-engine/pull/119) ships.
- **Swap:** `packages/swap-market` finds Electrum swap providers on Nostr (kind 30315), agrees a reverse swap over NIP-04 (kind 25582), Bark pays the hold invoice and the prepayment together, and the claim pays the receiver's address. KaleidoPay lists each provider with its quote. Mainnet providers answer; on test networks we run our own (`signet/electrum-provider`).
- **Order:** direct routes follow the receiver's order, then swaps; the payer picks. Arkade direct payments wait for a fee estimate from wallet-engine's Arkade adapter.
- Every quote includes Bark's own fee (`estimatePaymentFee`); no estimate, no quote.

## Ownership

| Piece | Where | Owner |
|---|---|---|
| SSPS spec | [kaleidoswap/ssps](https://github.com/kaleidoswap/ssps) (public) | Walter |
| `universal-code`: codec, BIP321, route planner | `packages/universal-code` | Walter (agents on request) |
| `swap-market`: Electrum providers over Nostr | `packages/swap-market` | Claude (this session) |
| Our swap providers and offer nodes | `signet/` | Claude |
| LDK forks (rails in offers) | rust-lightning, ldk-node, ldk-server, branch `feat/offer-ssps-rails` | Claude |
| **Payer:** scan, KaleidoPay executor and screen, Bark account, swap account, recovery | Rate `services/kaleidoPay/*` (except `merchantOffer*`), `screens/KaleidoPayScreen.tsx`, `components/payments` | Claude |
| **Receiver:** preference order (saved), reusable offer over NWC, receipts, Receive | Rate `screens/MerchantOfferScreen.tsx`, `ReceiveScreen`, `components/receive`, `services/kaleidoPay/merchantOffer*`, NWC client; `ldk-test-env/nwc-bridge` | Codex |
| Bark in wallet-engine and Rate | wallet-engine `BarkReactNativeAdapter`, Rate `services/protocols/bark.ts` | Mo |
| Electrum accelerator plugin | `electrum-accelerator/` | Mo |

## Interfaces between tracks

- **NWC → offer:** `kaleidopay_make_offer` takes `{ description, amount?, rails: RailEntry[] }` and returns `{ offer, offer_id, amount }`. The node side calls our ldk-server fork's `Bolt12Receive` with `ssps_rails = encodeRails(rails)`; stock ldk-server has no such field, so a node without the fork must fail the request, never drop the rails. The fork accepts object entries and amountless offers.
- **Receive → Pay:** the code is BIP321 (`universal-code` `encodePaymentCode`), so a plain wallet still pays the address or the offer.
- **Bark → KaleidoPay:** `connectBarkToKaleidoPay(adapter, network)` registers one account with both routes; screens only call `quotePaymentOffers` / `executePaymentOffer`.
- **wallet-engine patch:** any change to `BarkReactNativeAdapter.sendPayment` must keep `lno1…` going to `payLightningOffer` until the patch is replaced by a release (`barkOffer.test.ts` in Rate guards it).

