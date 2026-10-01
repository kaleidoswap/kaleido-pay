# universal-code

One payment code that says what the receiver accepts.

- BOLT12 offer carrying `ssps_rails` (odd TLV 1000000385, JCS JSON list of rail ids), so other wallets still see a normal offer.
- BIP321 link fallback for receivers without a Lightning node.
- Route planner: given what the payer holds and what the code accepts, pick direct payment or a swap.

Owner: Walter. Not started.
