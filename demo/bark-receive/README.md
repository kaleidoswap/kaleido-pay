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
through its stored record. No automated funding is part of this Bark probe.
