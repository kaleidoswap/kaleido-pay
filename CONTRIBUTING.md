# Contributing

- Text in English: commits, docs, code.
- Minimal comments; match the file around you.
- No secrets, mnemonics or API keys in the repo. Use `.env` (ignored).
- Run `npm test` before pushing. Live scripts (`packages/swap-market/scripts/`) hit real relays and providers; they create swaps but never pay them.
- Move money only on test networks unless you mean to.

## Protocol facts (verified 1 October 2026)
- Electrum swap offers: Nostr kind 30315, tags `d=electrum-swapserver-5`, `r=net:<mainnet|signet|testnet|mutinynet>`, `expiration`. Content: `percentage_fee, mining_fee, min_amount, max_forward_amount, max_reverse_amount, relays (comma string), pow_nonce (hex)`.
- PoW: leading zero bits of `sha256("electrum-" || pubkey || nonce as 32-byte BE)`; Electrum's client target is 30.
- Requests: kind 25582, NIP-04 encrypted, tag `["p", server]`, JSON with `method` (`createswap` for reverse, `createnormalswap` + `addswapinvoice` for forward). Replies carry `reply_to` = request event id, or `error`.
- Reverse swaps include `minerFeeInvoice` (prepayment, at most 2 x `mining_fee`), bundled with the main hold invoice: both must be paid together, so the swap runs in the payer's wallet.
- HTLC: Electrum's `WITNESS_TEMPLATE_SWAP` (P2WSH, 32-byte preimage size check, HASH160, CLTV refund). Claim witness `[sig, preimage, script]`.
- Electrum client refuses a reverse swap whose timeout is 60 blocks or less away.
- SSPS rails TLV in BOLT12: offer 1000000385 `ssps_rails`, invoice_request 2000000385 `ssps_rail`, invoice 3000000385 `ssps_lock`.
