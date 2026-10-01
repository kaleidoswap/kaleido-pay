#!/usr/bin/env bash
# Starts the provider daemon and prints its state. ./run.sh stop to stop it.
set -euo pipefail
cd "$(dirname "$0")"
E() { .venv/bin/electrum --signet -D data "$@"; }
if [ "${1:-}" = stop ]; then E stop; exit; fi
E daemon -d >/dev/null 2>&1 || true
sleep 3
E load_wallet >/dev/null
echo "funding address: $(E getunusedaddress)"
E getbalance
E list_channels | head -40
