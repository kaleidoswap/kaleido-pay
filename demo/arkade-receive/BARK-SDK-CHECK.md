# Bark SDK check before Rate wiring — 2026-10-02

Inspected installed `@secondts/bark` 0.24.0 TypeScript declarations and generated
WASM bridge in wallet-engine/node_modules. This is a contract/source check,
not a funded Bark payment or React Native runtime test.

| API | Finding |
| --- | --- |
| `estimateLightningSendFee(amountSats)` | Returns fee/gross/net and selected VTXOs; an estimate, no send commitment |
| `payLightningInvoice({invoice, amountSats?, wait?})` | No per-call fee-cap parameter; swaps should use wait:false |
| `checkLightningPayment({paymentHash,wait:false})` | Explicit follow-up by payment hash |
| `lightningSendState(paymentHash)` | Stored send state; unknown is not failure |
| `inProgress.send.feeSats` | Send's reported fee; unavailable on the paid union variant |
| `paid` | Carries `payment_hash` and preimage; normalize without logging preimages |

The current engine send adapter waits for settlement and returns fee:0. It also
ignored maxFeeSats. The fee-cap omission is fixed in codex/bark-fee-cap: requests
with a cap now fail before send. Do not fabricate payWithLimit for the transfer
controller by merely comparing a fee estimate. No Rate wiring was performed.

Before enabling the route: verify Mo's native binding against these operations,
provide nonblocking payment and durable status recovery, resolve fee enforcement
or explicitly design an estimated-cost consent flow, then run a funded Bark test.
The already completed 9,946 → 9,900-sat mainnet test used an external Lightning
wallet; it does not validate Bark. The existing Arkade balance remains untouched.

Official fee schedule (dynamic): https://second.tech/pricing
Installed SDK repository: https://gitlab.com/ark-bitcoin/bark-ffi-bindings
