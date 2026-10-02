# KaleidoPay Lightning → Arkade receive harness

Uses published `@kaleidorg/swap-sdk/arkade`, not a duplicate adapter and not the
KaleidoSwap maker. Node 22.13+ is required for built-in SQLite. Dependencies and
lockfile are isolated from the hackathon workspace and wallet-engine.

```sh
cd demo/arkade-receive
npm ci --ignore-scripts
npm run receive                                  # public registry + Ark server checks
npm run receive -- --prepare --amount 2000 --max-pay 2200
npm run receive -- --resume                       # one reconciliation pass
npm run receive -- --resume --watch               # poll for up to 35 minutes
npm test
```

On hosts requiring an HTTP proxy, use `NODE_USE_ENV_PROXY=1` on a Node version
supporting that setting. Never disable TLS verification. The Nostr transport
also needs relay connectivity.

Funded execution supports only Mutinynet. A separate mainnet preparation-only probe is available below. The script pins the third-party solver public key
and relay, checks the registry and Ark server network, and asks the SDK to verify
the invoice/hash, derive the contract and persist recovery before printing the
invoice. It never pays Lightning invoices. `--resume` may claim an incoming
funded swap using the test wallet's identity. Keep a receiving process running
with `--resume --watch` while a compatible Mutinynet Lightning wallet pays.
A signet BOLT11 prefix alone cannot distinguish all signet deployments.

State lives in gitignored `demo/.attempts/arkade-receive`: private identity,
atomic JSON swap records and SQLite wallet/contract repositories. Preserve the
entire directory. Files use owner-only permissions. A process lock prevents
concurrent execution; after a crash, remove that lock only after verifying no
process is using the wallet. Never share records: they contain recovery secrets.
A pending preparation prevents another prepare; resume it to resolve its state.

## Verified on 2026-10-01

- Public Mutinynet registry advertised `ln-solver-mutinynet`, key
  `3f831510a6d7678d0c90d7d6fbc4057720517e2e30681ef4c87cc57aaf57e8d5`.
- `https://mutinynet.arkade.sh/v1/info` reported `mutinynet`.
- A live receive preparation returned a verified invoice for **2,056 sats**
  to receive **2,000 sats**; the 56-sat difference excludes payer routing fees.
- A separate process recovered the record and reported `pending`, with no
  reconciliation errors. No invoice was paid and no funded claim was tested.
- Bitcoin and signet registry indexes were empty at inspection time; this does
  not establish that unlisted solvers are unavailable.

The registry's 30-bps advertised fee is not the final quote. Use the actual
quoted source and destination amounts. Its index generation time may be old;
only the live preparation establishes a current response.

## UI handoff

Use the existing venue, whose public API is already wired into wallet-engine:
`prepareLightningReceive`, `claimReceive`, and `reconcile`. The app owns scheduling.

| SDK evidence | UI text | Action |
| --- | --- | --- |
| verified preparation | Awaiting Lightning payment | Display invoice, pay/receive amounts and expiry |
| pending reconciliation | Transfer in progress | Keep receiving wallet available; poll |
| settled | Received on Arkade | Refresh spendable balance before displaying a confirmed balance increase |
| needsRecovery | Recovery required | Use the wallet's VTXO recovery flow |
| cancelled | Request expired or cancelled | Allow a new request |
| reconciliation error | Unable to update status | Retry; never infer payment failure from a timeout |

Still outstanding: a funded Mutinynet Lightning payment, claim and spendable
balance verification, interruption during funded recovery, and exact chain
compatibility with Mo's Bark backend. The local Bark configuration points at
Second's signet; do not assume it is Mutinynet or offer that route yet.

## Funded-test attempt (2026-10-01)

The local Lightning test node and Mutinynet explorer agreed on block 3471506
(`000001822878fda72c8a502b1dee307ee2355002f4d271967c829f69c279904b`).
The receiver watcher was started before requesting the 2,056-sat payment,
with a 100-sat routing-fee cap. The local node rejected the request immediately
with `RouteNotFound` (gRPC failed-precondition). Its two usable channels had
10,728 and 28,340 sats outbound capacity, so local balance alone was sufficient.
This does not establish remote liquidity or a usable route to the solver.

No payment was initiated successfully and no incoming claim was observed.
The receiver remained pending and the watcher was stopped. The attempt and
wallet recovery data were preserved. Next prerequisite: a Mutinynet Lightning
payer with a route to this solver, or repair the test node's routing connectivity.
Do not retry merely by increasing the fee cap or assume Bark signet is compatible.

## Mainnet availability probe (2026-10-01)

```sh
npm run receive -- --mainnet-probe --prepare --amount 500 --max-pay 1000
```

This contacts the legacy pinned Ark Labs solver over the same Nostr relay,
using `https://arkade.computer` and an isolated identity/recovery directory
`demo/.attempts/arkade-mainnet-probe`. It cannot resume/claim mainnet swaps and
does not print the invoice. Never pay an invoice produced by this probe: funded
mainnet recovery and an explicitly approved payment are separate prerequisites.

Despite the empty public bitcoin registry, the pinned mainnet solver replied
to an actual receive request: **504 sats Lightning for 500 sats Arkade**. The
SDK verified the invoice and persisted the preparation. The 4-sat difference
excludes payer routing fees. This proves current receive-quote availability,
not successful settlement or Bark connectivity. No mainnet funds were spent.
Quotes expire; do not treat these amounts as a permanent fee schedule.

## Bark integration handoff

`npm run receive -- --mainnet-probe --inspect` loads the existing identity and
records, checks invoice network/hash/amount/expiry and reads the Arkade balance.
It never claims or pays. An unknown wallet fee remains `null`, not zero.
`reviewReceive` returns `paymentAuthorized: false` even with a known fee cap;
application approval and enforcing that cap are separate wallet responsibilities.

The inspected wallet-engine Bark adapter awaits `payLightningInvoice` with
`wait: true`. Run receiver reconciliation concurrently: waiting for Lightning
completion before starting the receive claim can deadlock a hold invoice.
The adapter currently returns `fee: 0` without measured fee evidence; the host
must obtain the actual fee policy/cap instead of presenting that as free routing.
Do not modify Mo's adapter in this harness.

Mainnet receive recovery is an explicit, separate action:

```sh
npm run receive -- --mainnet-recovery --resume --watch
```

This may claim already-funded incoming swaps and reveal their preimages. It
uses the isolated mainnet probe wallet; it never initiates a Lightning payment.
Implementation is present but funded mainnet recovery has NOT been verified.
The preparation-only probe still refuses resume/watch. The previous warning
against paying probe invoices applies until the payer, fee approval and running
receiver have been established. Do not use an expired invoice.

Read-only mainnet inspection after preparation found the invoice expired and
all wallet balances zero. Next dependency: identify the Bark mainnet wallet,
verify its fee enforcement and status recovery, then prepare a fresh approved
request. The host must keep mainnet and test-network identities separate.

A later mainnet receive was prepared for 9,900 sats, with a 9,946-sat invoice.
The user will pay from an external Lightning wallet, capped at 10,000 sats
including routing. This tests LN → Arkade, not Bark → Arkade. Keys and invoice
are retained only in the ignored runtime directory. Settlement remains unverified
until the receiver observes and claims the funded lockup.

## Successful mainnet receive (2026-10-02, Europe/Berlin)

External Lightning payment: 9,946 sats. Arkade receive: 9,900 sats.
The solver reported `filling`, and the indexer showed a 9,900-sat unspent
lockup. The watcher now detects that funded output for prepared receives and
calls `notifyFunded` before reconciliation; an external payer cannot call that
wallet-local API itself. The SDK then completed the claim. Final record phase:
`settled`; fresh wallet balance: `available=9900`, `preconfirmed=9900`.
This is spendable Arkade balance, not an on-chain confirmation. External wallet
routing fees were not observed. This verifies LN → Arkade, not Bark → Arkade.

## Successful Bark → Arkade receive (2026-10-02)

The paired real Bark WASM harness paid 504 sats and the receiver settled swap
`ed0070accbd9d020c7493f8b44d35e4b87990766141457e7430d754b166845c3`.
Arkade available/preconfirmed balance increased from 8,885 to 9,385 sats.
Bark's final status was paid, with 476 spendable sats and no pending send,
from a 1,000-sat starting balance. Total observed cost: 24 sats, comprising
20 sats on Bark and 4 sats for the solver. This verifies both directions on
mainnet with the public solver; it does not verify the React Native bridge.
See [the Bark harness](../bark-receive/README.md) for commands and the SDK's
estimate-only fee limitation.
