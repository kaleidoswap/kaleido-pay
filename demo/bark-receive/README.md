# Bark SDK receive test

Exercises the real @secondts/bark 0.24.0 WASM in headless Chrome with persistent
IndexedDB. This is not a mocked adapter or a React Native device test.

```sh
npm ci --ignore-scripts
NODE_USE_ENV_PROXY=1 npm run probe                # create/reopen wallet, read balance
NODE_USE_ENV_PROXY=1 npm run probe -- --invoice   # create a 1,000-sat mainnet invoice
NODE_USE_ENV_PROXY=1 npm run probe -- --status    # inspect that receive
NODE_USE_ENV_PROXY=1 npm run probe -- --watch     # claim/poll that receive, up to 10 min
```

Requires local Google Chrome at the macOS path in probe.mjs. The loopback server
serves only the SDK module/WASM and a blank test page. HTTPS calls use the host's
configured proxy through Node fetch; TLS validation remains enabled.

The mnemonic, browser database, invoice and receive status live in the ignored
`demo/.attempts/bark-mainnet` directory with restrictive permissions. Preserve
that directory. No keys are printed. Run one instance at a time; the fixed port
and Chromium profile lock prevent concurrent instances. This wallet is mainnet.
Creating an invoice does not send funds; --watch may claim incoming funds.

`node ark-info.mjs [mainnet|signet]` prints the Ark server's info (its key is the `bark:<x-only key>` rail id) from a throwaway empty wallet; read-only.

Verified live on 2026-10-02: real WASM initialization, mainnet wallet open,
zero starting balance and a 1,000-sat Lightning invoice from Second. A later
process reopened the same wallet and observed awaiting-payment.

The paired Arkade harness can prepare an unfunded outgoing swap:

```sh
cd ../arkade-receive
NODE_USE_ENV_PROXY=1 npm run receive -- --mainnet-probe --prepare --send-invoice ../.attempts/bark-mainnet/receive.json --amount 1000 --max-pay 1100
```

Funding requires separate explicit mainnet amount approval. Once approved and
with the Bark watcher active, the Arkade harness accepts
`--mainnet-recovery --resume --fund-send <id> --approved-total <sats>`.
It verifies quote expiry, available balance, the current zero offchain fee
policy and the amount cap, then saves an exclusive submission marker before
sending. If a response is lost, do not delete the marker and retry: inspect
wallet history and lockup funding first. The SDK handles claim/refund recovery
through its stored record. The receive commands never initiate outgoing funding.

## Funded mainnet result — 2026-10-02

The user approved a maximum 1,100-sat debit. After cancelling the old expired,
unfunded preparation, a fresh quote required 1,015 sats to pay the new 1,000-sat
Bark invoice. The Arkade funding transaction was
`99faa2f2974f8a885a02a194df1271d25c38eafc1ff6f1e297a13362f6af7188`.
Swap `50d0d0189611670b79fea99763a76d0b70ce64991bbfa91387c195194da2df0e`
reconciled to settled. Bark's real WASM receiver claimed the incoming payment and
reported settled with 1,000 spendable sats. A fresh process reopened the wallet
and verified the same receive and balance.

Arkade available balance: 9,900 → 8,885 sats. Bark spendable balance: 0 → 1,000.
Observed total cost: 15 sats. No KaleidoSwap maker, Rate UI or native Bark bridge
was involved. This verifies Arkade → Lightning → Bark on mainnet; the React Native runtime still requires its own test.

## Bark → Arkade mainnet result — 2026-10-02

The reverse test completed using the same real WASM wallet. Bark paid a 504-sat
Lightning invoice and Arkade received 500 spendable sats through the public
solver. Bark reported `paid`; Arkade reconciled to `settled`.

- Bark spendable balance: 1,000 → 476 sats; pending Lightning send: 0.
- Arkade available/preconfirmed balance: 8,885 → 9,385 sats.
- Observed total cost: 24 sats (20 Bark + 4 solver).
- Swap: `ed0070accbd9d020c7493f8b44d35e4b87990766141457e7430d754b166845c3`.
- Payment hash: `6d6b193c4071d94d55fba56afffe5d656afeb281877d51bed77c2e5bbdddbb0c`.

The outgoing test commands are deliberately limited to a single prepared
500-sat Arkade receive in the paired harness's private records. Install that
harness's dependencies too; the probe imports its invoice decoder. Use Node
with native TypeScript stripping (verified with Node 25).

```sh
npm run probe -- --send-review
# Only after approving the mainnet test and starting Arkade recovery --watch:
npm run probe -- --send --accept-estimated-fee
npm run probe -- --send-status
```

The SDK has no hard fee cap. The send command checks the current estimate
(total at most 600 sats) and a wallet balance no greater than 1,000 sats. These
are test guards, not a guarantee on the final fee. It requires explicit
estimated-fee acceptance and records an exclusive submission marker plus the
payment hash before calling the SDK. If the response is lost, use send-status;
never delete the marker to retry. Keep receiver reconciliation running while
the Lightning hold invoice is pending. Final balances above were read after
reopening both wallets. Native Bark and Rate integration remain unverified.

## Reusable BOLT12 QR preflight

Bark WASM 0.24.0 exposes `payLightningOffer`; the installed native 0.25.0 bindings
also expose it, and wallet-engine beta.75 dispatches offers to that method.
Offer resolution belongs to Bark, not an invented conversion to BOLT11.

```sh
npm run probe -- --offer-capabilities
npm run probe -- --offer-review /absolute/path/offer.txt --amount 100
node --test offer.test.mjs
```

Both probe commands are read-only: they neither fetch an invoice nor pay.
The review accepts only simple Bitcoin-mainnet offers with an exact satoshi
amount (or no fixed amount), and rejects currency/quantity variants. It is a
conservative structural preflight, not full BOLT12 protocol validation.
`paymentEvidence` verifies a paid result's preimage without retaining it;
`verifyRepeatedOffer` rejects duplicate payment hashes or differing offers.
No live BOLT12 payment has been verified. The previous local recipient at
localhost:13646 was unreachable and was a Mutinynet node, not mainnet.

For the merchant demo, prefer an externally running BOLT12-capable node over
embedding a new LDK node in the mobile app. A mainnet receiver still needs a
reachable invoice-request path and inbound channel liquidity. Existing NWC
core make_invoice support does not establish reusable BOLT12 offer support;
the local ldk-test-env NWC bridge currently has no BOLT12-specific method.
