#!/usr/bin/env bash
# Runs our fork of ldk-server on signet (branch feat/offer-ssps-rails across
# kaleidoswap/rust-lightning, ldk-node and ldk-server).
#   ./run.sh            start in the background, log to data/server.out
#   ./run.sh stop
#   ./run.sh cli ...    ldk-server-cli against this node
set -euo pipefail
cd "$(dirname "$0")"
BIN=${LDK_SERVER_BIN_DIR:-$HOME/Lavoro/Kaleidoswap/.worktrees/bolt12-hold/ldk-server/target/release}
mkdir -p data
case "${1:-start}" in
  stop) [ -f data/pid ] && kill "$(cat data/pid)" && rm -f data/pid ;;
  cli) shift; exec "$BIN/ldk-server-cli" --base-url 127.0.0.1:3637 --tls-cert data/tls.crt --macaroon "$(cat data/signet/macaroons/admin.macaroon)" "$@" ;;
  *) nohup "$BIN/ldk-server" ldk-server-config.toml > data/server.out 2>&1 & echo $! > data/pid; sleep 5; tail -5 data/server.out ;;
esac
