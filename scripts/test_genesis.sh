#!/usr/bin/env bash
set -euo pipefail

# Run heartbeat + regression against the Genesis playground,
# using whatever tokens are defined in the project .env.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

echo "== VOIKE Genesis heartbeat + regression =="
echo "VOIKE_BASE_URL=${VOIKE_BASE_URL:-https://voike.supremeuf.com}"

python scripts/voike_heartbeat.py
python scripts/voike_regression.py --grid-fib "${1:-200}"

