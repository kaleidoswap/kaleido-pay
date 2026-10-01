#!/usr/bin/env bash
# Runs our fork of ldk-server on signet or Mutinynet (NET=mutinynet) (branch feat/offer-ssps-rails across
# kaleidoswap/rust-lightning, ldk-node and ldk-server).
#   ./run.sh            start in the background, log to data/server.out
#   ./run.sh stop
#   ./run.sh cli ...    ldk-server-cli against this node
set -euo pipefail
cd "$(dirname "$0")"
BIN=${LDK_SERVER_BIN_DIR:-$HOME/Lavoro/Kaleidoswap/.worktrees/bolt12-hold/ldk-server/target/release}
NET=${NET:-signet}
if [ "$NET" = signet ]; then CONF=ldk-server-config.toml; DATA=data; GRPC=127.0.0.1:3637
else CONF=ldk-server-config.$NET.toml; DATA=data-$NET; GRPC=127.0.0.1:3638; fi
mkdir -p "$DATA"
case "${1:-start}" in
  stop) [ -f "$DATA/pid" ] && kill "$(cat "$DATA/pid")" && rm -f "$DATA/pid" ;;
  cli) shift; exec "$BIN/ldk-server-cli" --base-url "$GRPC" --tls-cert "$DATA/tls.crt" --macaroon "$(cat "$DATA"/signet/macaroons/admin.macaroon)" "$@" ;;
  *) nohup "$BIN/ldk-server" "$CONF" > "$DATA/server.out" 2>&1 & echo $! > "$DATA/pid"; sleep 5; tail -5 "$DATA/server.out" ;;
esac
