# KaleidoPay: Arkade balance → BOLT12 offer

Checked 2026-10-01. Verdict: the maker already implements the required offer flow
on its Boltz-shaped API. The Intents API is not currently the path to use. No
invoice was fetched and no payment was sent during this spike.

## Current scope

The team deferred the KaleidoSwap maker route on 2026-10-01. These tools are
research artifacts, not the active demo path. Do not run the unfunded-create
probe until the fetch-only fix is deployed and verified. The pending image
build was stopped; the running maker and node were not changed. Continue
with Electrum swaps and the independent Bark wallet integration.

## Evidence

- Live GET `https://maker.signet.kaleidoswap.com/v2/swap/submarine` advertised
  `ARKD.BTC`, pair `BTC@LN/BTC@ARK`, minimum 10,000 sats, 1% service fee and zero
  quoted miner fee. This establishes catalogue availability only, not BOLT12
  deployment, complete fees or successful settlement. Limits change with liquidity.
- The maker's submarine endpoint accepts `offer`
  plus `invoiceAmount` and a refund public key. Offer resolution happens before
  venue derivation; Arkade is included. Never send an invented `preimageHash`.
- Creation calls `fetch_offer_payout`, waits for the node event, checks the
  exact amount, and derives the lock using the returned payment hash. The
  response adds `preimageHash`, `invoiceAmount` and `arkadeRefundLocktime`.
- `crates/maker-swap/src/executor.rs` pays the saved offer handle through the
  same node. It does not need a BOLT12 invoice exported to a different payer.
- `crates/maker-api/src/intents/quote.rs` still parses a BOLT11 invoice. The
  existing SDK `ArkadeVenue.prepareLightningSend` uses that Intents interface;
  passing a BOLT12 invoice/offer to it is not supported by this maker code.
- `ldk-server/ldk-server-grpc/src/proto/events.proto` exposes ID/hash/amount,
  not raw invoice, expiry or proof of offer binding. A maker's hash echo alone
  is not independent proof to the client that it will pay the requested offer.
- `ldk-server/src/api/bolt12_fetch_invoice.rs` marks manual payment IDs after
  initiating the request; `ldk-server/src/main.rs` auto-pays events not in that
  set. Potential race from source inspection, not reproduced. Review the exact
  deployed revision and make fetch-only handling fail closed before live use.
- The default local recipient endpoint, `127.0.0.1:13646`, was unavailable.

The maker's BOLT12 design document describes an older deployment blocker, but
`e2e/Dockerfile.ldk-server` now pins a different revision and the existing
`e2e/driver/src/bin/signet_bolt12_probe.rs` records a September node upgrade.
Do not treat the older deployment table as current proof of support or failure.
The probe also documents a blinded-path routing problem when the maker itself
is the recipient's introduction node. A reachable offer needs testing.

## Recommended implementation

1. Get a real test offer from a node with a usable blinded payment path on the
   same test chain. Confirm genesis/network, not just `tb` address encoding.
2. Review the deployed fetch-only implementation. Fetch-only must not pay,
   including under early events and restart. Avoid an unrelated node upgrade.
3. Create ONE unfunded Arkade offer swap using `/v2/swap/submarine`, with the
   named pair, offer, `invoiceAmount` and the wallet's refund public key.
4. Match the returned hash and amount against the recipient's actual issued
   invoice for this demo. For arbitrary recipients, design authenticated
   invoice export/verification before claiming independent offer binding.
5. Build a wallet adapter for the returned Boltz-shaped Arkade VHTLC. Verify
   server identity, script/tree, claim/refund keys, hash, destination, deadline,
   funding amount and recovery path. Do not feed it into the Intents ScriptV2
   adapter blindly: this API uses a different construction without corridor
   covenant destinations. Inspect the returned tree and supported script profile.
6. Persist keys/attempt before funding; approve the complete fee quote; fund
   from Arkade; verify recipient settlement and maker claim. Test refund too.

Mo's Bark wallet-engine work is independent. This route uses KaleidoSwap's maker,
not Electrum's providers. Electrum remains useful for the existing LN→on-chain demo.

## Preflight tooling

From `universal-bolt12/`:

```sh
npx tsx demo/bolt12-arkade-preflight.mts --catalogue
npx tsx demo/bolt12-arkade-preflight.mts --offer "$TEST_OFFER" --amount 20000 --refund-pubkey "$REFUND_PUBLIC_KEY"
npx tsx --test demo/bolt12-arkade-preflight.test.mts
```

Preparation prints a request but never POSTs it. `--response <file>` inspects a
previously saved create response, emits only selected public metadata, and always
reports `fundable: false`. Keep the original response secure: `swapAuth` is a
credential. The checks are preliminary; an address prefix is not script validation,
and syntactic offer decoding is not signature/amount/network/expiry verification.
No secrets, wallet access, funding, signing or invoice payment are implemented.

## Deferred live checkpoint

An unfunded create responds with an Arkade lock and a BOLT12 hash independently
matched to the recipient's invoice. Still outstanding: verified offer reachability, deployed fetch-only review
and wallet-side VHTLC checks. The local recipient was subsequently started,
as recorded below.

## Follow-up: recipient online and fetch gate fix (2026-10-01)

The existing Mutinynet recipient was started using its cached binary and existing
state, with its listeners restricted to localhost. Inspection found two usable
channels to the maker: one public with no inbound capacity, one private with
184,612,000 msat inbound. A fixed 20,000-sat offer with a one-hour expiry was
created and saved in the gitignored node runtime directory as
`kaleidopay-offer.json`. Creating an offer does not establish that its blinded
path can be reached by the maker or that invoice negotiation succeeds.

`node demo/local-bolt12-recipient.cjs` reads node/channel status; add `--offer`
to mint a fresh offer. It uses the existing local recipient's pinned TLS cert
and reads its API key without printing it. No send/fetch/pay methods are exposed.
It defaults to the workspace's Rate-installed protobufjs and cached recipient
proto; override `KALEIDOPAY_PROTOBUF_MODULE` and `KALEIDOPAY_NODE_DIR` if needed.
The gRPC endpoint is intentionally fixed to localhost:13646.

The node race fix lives on a separate LDK branch, based on node revision `86ca542` and later
updated to preserve deployed revision `35305e7`.
It replaces the manual-payment exclusion list with explicit, single-use
`Bolt12Send` authorizations. Registration holds a mutex across request initiation
and insertion, so an early invoice event cannot bypass the decision. Fetches,
unknown IDs, duplicate events and IDs after restart remain unpaid automatically.
After restart, previously auto-pay requests may need explicit handling; the
change intentionally prioritizes not spending on unknown authorization. This is
not durable invoice recovery: pending invoice state remains a separate concern.
The fix has not been deployed to the maker. No live swap create was submitted.

Fix published as draft PR https://github.com/kaleidoswap/ldk-server/pull/5,
commit `4e506d39d5611f8baac77e9db7bb2d73ba3f36b3`.
`cargo check -p ldk-server --locked` and all 41 server tests passed
after incorporating the deployed base. The PR targets the existing BOLT12 fetch/pay branch;
no deployment was performed. The live swap remains unsubmitted pending node
integration and deployed-behavior verification.
