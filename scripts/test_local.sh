#!/usr/bin/env bash
set -euo pipefail

# Run heartbeat + regression against a local VOIKE node
# on http://localhost:8080.
#
# Expected setup:
#   1) Bring up the local stack: docker compose up -d --build
#   2) Create a local project/API key via /admin/projects
#   3) Add VOIKE_LOCAL_API_KEY=<local-key> to .env (optional but recommended)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

# Always point this script at the local node.
export VOIKE_BASE_URL="http://localhost:8080"

# Prefer an explicit local key if provided in .env.
if [ -n "${VOIKE_LOCAL_API_KEY:-}" ]; then
  export VOIKE_API_KEY="$VOIKE_LOCAL_API_KEY"
fi

short_key() {
  local key="${1:-}"
  if [ -z "$key" ]; then
    printf "%s" "(unset)"
  else
    printf "%s" "${key:0:8}…"
  fi
}

echo "== VOIKE local heartbeat + regression =="
echo "VOIKE_BASE_URL=${VOIKE_BASE_URL}"
echo "Using VOIKE_API_KEY=$(short_key "${VOIKE_API_KEY:-}")"

python scripts/voike_heartbeat.py
python scripts/voike_regression.py --grid-fib "${1:-200}"

