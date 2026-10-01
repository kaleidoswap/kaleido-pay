# Swap execution boundary for KaleidoPay

Keep provider protocols and recoverable execution in SDK packages, wallet authority
in wallet-engine, and presentation in Rate. Do not move all payment code into one
provider-specific SDK or duplicate the existing Electrum executor.

| Component | Responsibility |
| --- | --- |
| universal-code | Decode recipient requests and select explicitly supported routes; no keys or payments |
| swap-market | Electrum Nostr discovery, quotes, contract checks, persisted attempts, lockup monitoring and claim |
| Arkade Intents adapter (pending) | Use the maintained Arkade SDK for Lightning receive preparation, verification, claim and recovery; no KaleidoSwap maker dependency |
| wallet-engine | Bark identity, invoice payment, payment status, secure storage and chain identity |
| Rate | Recipient input, fee approval, progress and recovery UI |

For the hackathon keep Electrum in this workspace. A future shared swap SDK can
expose provider adapters without forcing Electrum contracts and Arkade Intents
contracts into one data model. Integrate only after verifying the live Intents
receive corridor and its network; no live compatibility has been established here.

## Electrum wallet contract

Use `startAttempt` to persist secrets and the agreed swap before payment. Then
call `payAttempt` with a `LightningPayer`. `payInvoices` must initiate the main
hold invoice and optional miner-fee invoice together: awaiting settlement of the
main invoice before starting the second invoice deadlocks the swap. The wallet
must supply bounded routing fees and durable payment tracking. Those capabilities
still need verification with Bark; the current payer interface does not enforce them.

After interruption use `resumeAttempt`; it never starts a payment. A `recoverable`
attempt means monitoring stopped, not that the payment failed. `claiming` means a
signed transaction is saved and can be rebroadcast. `claimed` means broadcast
accepted or the exact transaction observed; it does not mean Bitcoin confirmation
or independently verified Lightning settlement. Keep the signed claim private:
its witness contains the preimage. Never upload attempt records to public logs.

Existing `failed` records may also be resumed unless marked `never paid`.
Only one executor per attempt may run at a time; the caller must serialize calls.

## Next integration checkpoints

1. Verify Bark can initiate both invoices and recover their payment status.
2. Agree complete cost bounds, including wallet routing and claim mining fees.
3. Connect wallet-engine storage/payer adapters; verify exact chain identity.
4. Run a funded test-chain Electrum swap and exercise interruption/recovery.
5. Add Arkade Intents through its own adapter after live API/network verification.
6. Expose both routes in Rate with explicit recipient amount and completion states.

Offline tests cover claim construction and interrupted execution. No funded swap
or live Arkade Intents integration is claimed by these tests. Remaining work also
includes claim fee changes, expired/spent lockups, and final settlement tracking.

## Bark → Arkade orchestration

`createArkadeTransferController` accepts a receiver-verified, persisted request,
a Bark sender and a receive reconciler. It serializes execution per attempt,
persists `submitted` before calling the payer, and never pays on restart.
Completion requires both the matching Lightning payment hash and a settled,
spendable Arkade receipt for the requested amount. Ambiguous errors remain
`unknown`, and resume consults both sides without submitting again.

A host must use secure storage, validate request terms with the receive SDK,
and bind the sender to the correct account and exact network. One controller
owns each store/account; its in-process lock is not a cross-process lock.
`payWithLimit` must enforce the approved total and return a pending result for
hold invoices. It is deliberately not mapped to Bark's raw send call: the
installed API exposes fee estimation but no per-call spending-limit argument.
Do not equate an estimate with enforcement or use the adapter's placeholder
`fee: 0` as the real fee. Until that contract is available, use an external
Lightning payer for the receive demonstration and do not advertise automated
Bark mainnet payment as ready.
