# signet

Signet infrastructure for the demo. Owner: Claude (on Walter's track).

## electrum-provider/: our own Electrum swap provider

The public signet providers on Nostr do not work (they ignore requests or answer "internal error"), so we run one: Electrum 4.8.2 from source with the `swapserver` plugin. It announces on Nostr in the same format as the mainnet providers, so `swap-market` and any Electrum user on signet can use it.

```bash
cd signet/electrum-provider
./setup.sh        # once: venv, Electrum, signet wallet (seed in data/seed-backup.json, owner-only), plugin config
./run.sh          # start the daemon, print funding address, balance, channels
./run.sh stop
```

Needs autoconf, automake and libtool (`brew install autoconf automake libtool`) to build libsecp256k1. `data/` holds the wallet and seed and is git-ignored.

To serve swaps the provider needs:

1. on-chain signet coins for the lockups (0.5–1M sats) at the funding address;
2. Lightning capacity to receive: it opens a channel to a signet node the payers can reach (Second's signet Lightning node, for Bark payers), then pays a Bark invoice through it, which creates the receiving side and funds the Bark payer in one step.

The plugin mines its own Nostr announcement proof-of-work; the client can also lower its target for this provider.

## ldk-node/: the node that issues universal offers

Our fork of ldk-server (branch `feat/offer-ssps-rails` of rust-lightning, ldk-node and ldk-server) on signet and Mutinynet. `./run.sh` starts it (`NET=mutinynet` for Mutinynet), `./run.sh cli ...` drives it, and `npm run offer` at the repo root issues and decodes a universal offer. Why the fork is needed and what it changes: [docs/bolt12.md](../docs/bolt12.md).
