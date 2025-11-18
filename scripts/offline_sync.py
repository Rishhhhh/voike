#!/usr/bin/env python3
"""
Offline sync utility for VOIKE.

The script pulls ledger entries + capsules periodically and writes them to a local
cache file so sites can continue operating when cloud dependencies drop.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def parse_args():
  parser = argparse.ArgumentParser(description="VOIKE offline sync helper.")
  parser.add_argument("--base-url", default=os.getenv("VOIKE_API_URL", "http://localhost:8080"), help="VOIKE HTTP URL")
  parser.add_argument("--api-key", default=os.getenv("VOIKE_API_KEY"), help="Project API key")
  parser.add_argument("--interval", type=int, default=60, help="Sync interval in seconds")
  parser.add_argument("--output", default="offline-cache.json", help="Path to cache file")
  parser.add_argument("--capsules", action="store_true", help="Include capsule metadata")
  return parser.parse_args()


def fetch_json(url: str, headers: dict):
  req = urllib.request.Request(url, headers=headers)
  with urllib.request.urlopen(req) as resp:
    return json.loads(resp.read().decode("utf-8"))


def sync_once(args, headers):
  ledger_url = args.base_url.rstrip("/") + "/ledger/recent?limit=50"
  ledger = fetch_json(ledger_url, headers)
  data = {"timestamp": time.time(), "ledger": ledger}
  if args.capsules:
    capsules_url = args.base_url.rstrip("/") + "/capsules"
    try:
      data["capsules"] = fetch_json(capsules_url, headers)
    except urllib.error.HTTPError:
      data["capsules"] = []
  Path(args.output).write_text(json.dumps(data, indent=2), encoding="utf-8")
  print(f"[offline-sync] wrote {args.output} with {len(ledger)} ledger entries")


def main():
  args = parse_args()
  if not args.api_key:
    sys.exit("API key missing (set --api-key or VOIKE_API_KEY).")
  headers = {"x-voike-api-key": args.api_key}
  while True:
    try:
      sync_once(args, headers)
    except urllib.error.URLError as err:
      print(f"[offline-sync] failed: {err}")
    if args.interval <= 0:
      break
    time.sleep(args.interval)


if __name__ == "__main__":
  main()
