#!/usr/bin/env python3
"""
Utility script for creating Capsules via the VOIKE API.

Usage:
  python scripts/make_capsule_snapshot.py \
    --base-url http://localhost:8080 \
    --api-key $VOIKE_API_KEY \
    --project-id $VOIKE_PROJECT_ID \
    --manifest manifests/snapshot.json \
    --memo "Nightly snapshot"
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def parse_args():
  parser = argparse.ArgumentParser(description="Create a Capsule snapshot through the VOIKE API.")
  parser.add_argument("--base-url", default=os.getenv("VOIKE_API_URL", "http://localhost:8080"), help="VOIKE HTTP URL")
  parser.add_argument("--api-key", default=os.getenv("VOIKE_API_KEY"), help="Project API key (X-VOIKE-API-Key)")
  parser.add_argument("--project-id", default=os.getenv("VOIKE_PROJECT_ID"), help="Project UUID")
  parser.add_argument("--manifest", help="Path to manifest JSON describing tables/blobs/models to capture.")
  parser.add_argument("--memo", default="Automated snapshot", help="Description stored with the Capsule.")
  parser.add_argument("--label", action="append", dest="labels", help="Optional label(s) to attach to the Capsule.")
  return parser.parse_args()


def load_manifest(path: str | None):
  if path:
    with open(path, "r", encoding="utf-8") as fh:
      return json.load(fh)
  return {
    "tables": ["*"],
    "blobs": ["*"],
    "codeRefs": {
      "flows": "flows/",
      "docs": "docs/",
    },
  }


def request(base_url: str, api_key: str, method: str, path: str, payload: dict | None):
  if not api_key:
    raise SystemExit("API key missing (set --api-key or VOIKE_API_KEY).")
  url = base_url.rstrip("/") + path
  data = json.dumps(payload or {}).encode("utf-8")
  req = urllib.request.Request(url, data=data, method=method)
  req.add_header("content-type", "application/json")
  req.add_header("x-voike-api-key", api_key)
  try:
    with urllib.request.urlopen(req) as resp:
      body = resp.read().decode("utf-8")
      return json.loads(body)
  except urllib.error.HTTPError as err:
    sys.exit(f"Request failed: {err.status} {err.reason} {err.read().decode('utf-8')}")


def main():
  args = parse_args()
  manifest = load_manifest(args.manifest)
  payload = {
    "manifest": manifest,
    "description": args.memo,
    "labels": args.labels or ["snapshot", "ci"],
  }
  result = request(args.base_url, args.api_key, "POST", "/capsules", payload)
  capsule_id = result.get("capsuleId")
  print(json.dumps({"capsuleId": capsule_id, "memo": args.memo}, indent=2))


if __name__ == "__main__":
  main()
