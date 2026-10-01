#!/usr/bin/env bash
# One-time setup: Electrum 4.8.2 from source, a signet Lightning wallet, the swapserver plugin.
# The seed is written to data/seed-backup.json (owner-only) and never printed.
set -euo pipefail
cd "$(dirname "$0")"
PY=${PYTHON:-/opt/homebrew/bin/python3.14}
[ -d src ] || git clone -q --depth 1 --branch 4.8.2 https://github.com/spesmilo/electrum.git src
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/pip install -q -e "src[crypto]"   # needs autoconf automake libtool for libsecp256k1
# Signet only: Electrum refuses channels under 200k sats; our test coins are scarce.
sed -i '' "s/^MIN_FUNDING_SAT = .*/MIN_FUNDING_SAT = ${MIN_FUNDING_SAT:-100_000}/" src/electrum/lnutil.py
E() { .venv/bin/electrum --signet -D data "$@"; }
if [ ! -f data/signet/wallets/default_wallet ]; then
  mkdir -p data && umask 077
  E -o create --seed_type segwit > data/seed-backup.json
fi
E -o setconfig plugins.swapserver.enabled true >/dev/null
E -o setconfig plugins.swapserver.fee_millionths "${FEE_MILLIONTHS:-5000}" >/dev/null
E -o setconfig use_gossip true >/dev/null
E -o setconfig nostr_relays "${NOSTR_RELAYS:-wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net,wss://relay.getalby.com/v1}" >/dev/null
echo "setup done; start with ./run.sh"
