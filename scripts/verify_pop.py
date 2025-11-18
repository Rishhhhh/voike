#!/usr/bin/env python3
"""
Verify POP availability by checking SNRL + VDNS endpoints.

Example:
  python scripts/verify_pop.py \
    --base-url http://localhost:8080 \
    --api-key $VOIKE_API_KEY \
    --admin-token $VOIKE_ADMIN_TOKEN \
    --domain api.voike.com \
    --zone-id voike-com
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def parse_args():
  parser = argparse.ArgumentParser(description="Verify POP / resolver health.")
  parser.add_argument("--base-url", default=os.getenv("VOIKE_API_URL", "http://localhost:8080"), help="VOIKE HTTP URL")
  parser.add_argument("--api-key", default=os.getenv("VOIKE_API_KEY"), help="Project API key")
  parser.add_argument("--admin-token", default=os.getenv("VOIKE_ADMIN_TOKEN"), help="Admin token for VDNS calls")
  parser.add_argument("--domain", default="api.voike.com", help="Domain to resolve via SNRL")
  parser.add_argument("--zone-id", default="voike-com", help="VDNS Zone ID to export")
  parser.add_argument("--client-region", default="dev-local", help="Client region metadata")
  parser.add_argument("--client-capabilities", default="http,gpu", help="Comma-separated client capabilities")
  return parser.parse_args()


def request(base_url: str, path: str, method: str = "GET", data: dict | None = None, headers: dict | None = None):
  url = base_url.rstrip("/") + path
  payload = json.dumps(data).encode("utf-8") if data else None
  req = urllib.request.Request(url, data=payload, method=method)
  req.add_header("content-type", "application/json")
  if headers:
    for key, value in headers.items():
      req.add_header(key, value)
  with urllib.request.urlopen(req) as resp:
    return json.loads(resp.read().decode("utf-8"))


def main():
  args = parse_args()
  if not args.api_key:
    sys.exit("API key is required (--api-key or VOIKE_API_KEY).")

  # Step 1: verify SNRL resolution
  client = {
    "region": args.client_region,
    "capabilities": [cap.strip() for cap in args.client_capabilities.split(",") if cap.strip()],
  }
  snrl_payload = {"domain": args.domain, "client": client}
  snrl_headers = {"x-voike-api-key": args.api_key}
  snrl_result = request(args.base_url, "/snrl/resolve", "POST", snrl_payload, snrl_headers)

  # Step 2: export zone if admin token present
  zone_result = {}
  if args.admin_token:
    zone_headers = {"x-voike-admin-token": args.admin_token}
    zone_result = request(args.base_url, f"/vdns/zones/{args.zone_id}/export", "GET", None, zone_headers)

  report = {
    "domain": args.domain,
    "candidates": snrl_result.get("candidates", []),
    "signature": snrl_result.get("signature"),
    "zoneId": args.zone_id,
    "zoneLength": len(zone_result.get("zoneFile", "")) if zone_result else 0,
  }
  print(json.dumps(report, indent=2))


if __name__ == "__main__":
  try:
    main()
  except urllib.error.HTTPError as err:
    sys.exit(f"POP verification failed: {err.status} {err.reason} {err.read().decode('utf-8')}")
