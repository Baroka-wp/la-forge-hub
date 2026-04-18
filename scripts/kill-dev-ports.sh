#!/usr/bin/env bash
# Libère les ports de dev (uniquement les sockets en LISTEN, pas les navigateurs connectés).
set -euo pipefail
PORTS="${PORTS:-5173 5174 5175 5176 24678}"
for p in $PORTS; do
  pids=$(lsof -nP -iTCP:"$p" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -n "${pids:-}" ]]; then
    echo "Port $p (LISTEN) → kill $pids"
    kill -9 $pids 2>/dev/null || true
  fi
done
echo "OK."
