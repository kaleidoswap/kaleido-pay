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
npm run receive -- --resume --watch               # poll for up to ten minutes
npm test
```

On hosts requiring an HTTP proxy, use `NODE_USE_ENV_PROXY=1` on a Node version
supporting that setting. Never disable TLS verification. The Nostr transport
also needs relay connectivity.

Only Mutinynet is supported. The script pins the third-party solver public key
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
