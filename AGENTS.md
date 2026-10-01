# Working in this repo (humans and agents)

## Ownership
Each folder has one owner (see README). Agents work only inside the folder they were assigned. If a change is needed elsewhere, write it in the PR or commit message and leave it to that folder's owner.

## Branching
Hackathon pace: commit straight to `main` in small commits, pull with rebase before pushing. Never force-push `main`. Several agents may push at once, so keep each commit inside your folder.

## Rules
- Published text (commits, docs, code) in English.
- Minimal comments; match the file around you.
- No secrets, mnemonics or API keys in the repo. Use `.env` (ignored).
- Money moves only on signet, or on mainnet with amounts the owner approved (25–50k sats). Never mainnet without the owner saying so.
- Run `npm test` before pushing. Live tests (`scripts/`) hit real relays and providers; they create swaps but never pay them.

## Protocol facts (verified 1 October 2026)
- Electrum swap offers: Nostr kind 30315, tags `d=electrum-swapserver-5`, `r=net:<mainnet|signet|testnet|mutinynet>`, `expiration`. Content: `percentage_fee, mining_fee, min_amount, max_forward_amount, max_reverse_amount, relays (comma string), pow_nonce (hex)`.
- PoW: leading zero bits of `sha256("electrum-" || pubkey || nonce as 32-byte BE)`; Electrum's client target is 30.
- Requests: kind 25582, NIP-04 encrypted, tag `["p", server]`, JSON with `method` (`createswap` for reverse, `createnormalswap` + `addswapinvoice` for forward). Replies carry `reply_to` = request event id, or `error`.
- Reverse swaps include `minerFeeInvoice` (prepayment, at most 2 x `mining_fee`), bundled with the main hold invoice: both must be paid together, so the swap runs in the payer's wallet.
- HTLC: Electrum's `WITNESS_TEMPLATE_SWAP` (P2WSH, 32-byte preimage size check, HASH160, CLTV refund). Claim witness `[sig, preimage, script]`.
- Electrum client refuses a reverse swap whose timeout is 60 blocks or less away.
- SSPS rails TLV in BOLT12: offer 1000000385 `ssps_rails`, invoice_request 2000000385 `ssps_rail`, invoice 3000000385 `ssps_lock`.
