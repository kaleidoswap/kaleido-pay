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

## ldk-node issuing universal offers (planned)

LDK includes experimental offer fields in the HMAC it uses to recognise its own offers, so a rails field added to an issued offer makes every invoice request fail. The node must issue the offer with `ssps_rails` inside, which needs a small patch through our forks (rust-lightning → ldk-node → ldk-server).
