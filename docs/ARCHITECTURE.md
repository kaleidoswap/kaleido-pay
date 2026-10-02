# KaleidoPay: how the pieces fit

How the receiver and payer flows fit together across Rate, the packages here, wallet-engine's Bark adapter and our LDK forks.

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
- The app reaches that node over **NWC** (Nostr Wallet Connect). The NWC request must carry the rails and end in `Bolt12Receive.ssps_rails`; a node without the fork must make the request fail, never silently drop the rails.
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

## Components

| Piece | Where |
|---|---|
| SSPS spec | [kaleidoswap/ssps](https://github.com/kaleidoswap/ssps) |
| `universal-code`: rails record, BIP321, network detection, route planner | `packages/universal-code` |
| `swap-market`: Electrum swap providers over Nostr | `packages/swap-market` |
| Test-network swap providers and offer nodes | `signet/` |
| LDK forks: rails in offers | [rust-lightning](https://github.com/kaleidoswap/rust-lightning/tree/feat/offer-ssps-rails), [ldk-node](https://github.com/kaleidoswap/ldk-node/tree/feat/offer-ssps-rails), [ldk-server](https://github.com/kaleidoswap/ldk-server/tree/feat/offer-ssps-rails) |
| Payer: scan, routes, quotes, Bark and swap accounts, recovery | Rate `services/kaleidoPay/*`, `screens/KaleidoPayScreen.tsx`, `components/payments` |
| Receiver: ordered layers, reusable offer over NWC, receipts | Rate `screens/MerchantOfferScreen.tsx`, `services/kaleidoPay/merchantOffer*`, NWC client; an NWC bridge in front of the LDK node |
| Bark | wallet-engine `BarkReactNativeAdapter`, Rate `services/protocols/bark.ts` |

## Interfaces

- **NWC → offer:** `kaleidopay_make_offer` takes `{ description, amount?, rails: RailEntry[] }` and returns `{ offer, offer_id, amount }`. The node side calls our ldk-server fork's `Bolt12Receive` with `ssps_rails = encodeRails(rails)`; stock ldk-server has no such field, so a node without the fork must fail the request, never drop the rails. The fork accepts object entries and amountless offers (ldk-server `d7a20bb`, ldk-node `cf33fbc` on `feat/offer-ssps-rails`); stock ldk-server, which the `ldk-test-env` bridge builds today, does not.
- **Receive → Pay:** the code is BIP321 (`universal-code` `encodePaymentCode`), so a plain wallet still pays the address or the offer.
- **Bark → KaleidoPay:** `connectBarkToKaleidoPay(adapter, network)` registers one account with both routes; screens only call `quotePaymentOffers` / `executePaymentOffer`.
- **wallet-engine patch:** any change to `BarkReactNativeAdapter.sendPayment` must keep `lno1…` going to `payLightningOffer` until the patch is replaced by a release (`barkOffer.test.ts` in Rate guards it).

