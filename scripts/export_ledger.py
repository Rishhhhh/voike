#!/usr/bin/env python3
"""
Export the Truth Ledger for a VOIKE project into a JSON file.

Example:
  python scripts/export_ledger.py \
    --base-url http://localhost:8080 \
    --api-key $VOIKE_API_KEY \
    --project-id $VOIKE_PROJECT_ID \
    --limit 50 \
    --output ./ledger-export.json
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def parse_args():
  parser = argparse.ArgumentParser(description="Export VOIKE truth ledger entries.")
  parser.add_argument("--base-url", default=os.getenv("VOIKE_API_URL", "http://localhost:8080"), help="VOIKE HTTP URL")
  parser.add_argument("--api-key", default=os.getenv("VOIKE_API_KEY"), help="Project API key")
  parser.add_argument("--project-id", default=os.getenv("VOIKE_PROJECT_ID"), help="Project UUID")
  parser.add_argument("--limit", type=int, default=50, help="Number of entries to fetch")
  parser.add_argument("--output", default="ledger-export.json", help="Output file path")
  return parser.parse_args()


def request(base_url: str, api_key: str, path: str):
  if not api_key:
    raise SystemExit("API key missing (set --api-key or VOIKE_API_KEY).")
  url = base_url.rstrip("/") + path
  req = urllib.request.Request(url, method="GET")
  req.add_header("x-voike-api-key", api_key)
  try:
    with urllib.request.urlopen(req) as resp:
      data = resp.read().decode("utf-8")
      return json.loads(data)
  except urllib.error.HTTPError as err:
    sys.exit(f"Ledger export failed: {err.status} {err.reason} {err.read().decode('utf-8')}")


def main():
  args = parse_args()
  path = f"/ledger/recent?limit={args.limit}"
  entries = request(args.base_url, args.api_key, path)
  with open(args.output, "w", encoding="utf-8") as fh:
    json.dump(entries, fh, indent=2)
  print(f"Exported {len(entries)} ledger entries to {args.output}")


if __name__ == "__main__":
  main()
