#!/usr/bin/env python3
"""
Replay VOIKE ledger entries locally via the /ledger/replay API.

Example:
  python scripts/ledger_replay.py \
    --base-url http://localhost:8080 \
    --api-key $VOIKE_API_KEY \
    --project-id $VOIKE_PROJECT_ID \
    --since "2025-01-01T00:00:00Z" \
    --output replay.json
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def parse_args():
  parser = argparse.ArgumentParser(description="Replay the VOIKE Truth Ledger via API.")
  parser.add_argument("--base-url", default=os.getenv("VOIKE_API_URL", "http://localhost:8080"), help="VOIKE HTTP URL")
  parser.add_argument("--api-key", default=os.getenv("VOIKE_API_KEY"), help="Project API key")
  parser.add_argument("--project-id", default=os.getenv("VOIKE_PROJECT_ID"), help="Project UUID (for reference)")
  parser.add_argument("--since", help="ISO timestamp for replay start")
  parser.add_argument("--until", help="ISO timestamp for replay end")
  parser.add_argument("--limit", type=int, default=200, help="Max entries to fetch (<=500)")
  parser.add_argument("--output", default="ledger-replay.json", help="Output file")
  return parser.parse_args()


def replay(args):
  if not args.api_key:
    raise SystemExit("API key missing (set --api-key or VOIKE_API_KEY).")
  payload = {
    "since": args.since,
    "until": args.until,
    "limit": args.limit,
  }
  url = args.base_url.rstrip("/") + "/ledger/replay"
  req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode("utf-8"),
    method="POST",
    headers={
      "content-type": "application/json",
      "x-voike-api-key": args.api_key,
    },
  )
  try:
    with urllib.request.urlopen(req) as resp:
      return json.loads(resp.read().decode("utf-8"))
  except urllib.error.HTTPError as err:
    sys.exit(f"Ledger replay failed: {err.status} {err.reason} {err.read().decode('utf-8')}")


def main():
  args = parse_args()
  result = replay(args)
  with open(args.output, "w", encoding="utf-8") as fh:
    json.dump(result, fh, indent=2)
  final_energy = result.get("finalEnergy")
  print(f"Replayed {result.get('count')} entries (final energy={final_energy}) -> {args.output}")


if __name__ == "__main__":
  main()
