#!/usr/bin/env python3
"""
Quick Fibonacci check that lets VOIKE-X execute a recursive SQL query.
The script is intentionally simple so you can just run `python3 scripts/voikefib.py`
after pulling the repo to verify the API key is alive.
"""

import os
import sys
import requests

API_KEY = "4cdef1e80151bc5684e1edb20e502033515c5144dbb6180b8f27cbd0e3883369"
BASE_URL = os.environ.get("VOIKE_BASE_URL", "https://voike.supremeuf.com")
FIB_N = int(os.environ.get("FIB_N", "300"))

SQL = f"""
WITH RECURSIVE fib(idx, a, b) AS (
  SELECT 0, 0::numeric, 1::numeric
  UNION ALL
  SELECT idx + 1, b, a + b
  FROM fib
  WHERE idx < {FIB_N}
)
SELECT a::text AS fib_value
FROM fib
WHERE idx = {FIB_N};
"""


def main():
  headers = {"x-voike-api-key": API_KEY, "content-type": "application/json"}
  resp = requests.post(
    f"{BASE_URL}/query",
    headers=headers,
    json={"kind": "sql", "sql": SQL},
    timeout=30,
  )
  if resp.status_code != 200:
    print(f"VOIKE query failed: {resp.status_code} {resp.text}", file=sys.stderr)
    sys.exit(1)

  data = resp.json()
  rows = data.get("rows") or []
  if not rows:
    print("VOIKE responded but returned no rows.", file=sys.stderr)
    sys.exit(1)

  print(f"fib({FIB_N}) = {rows[0].get('fib_value')}")
  print("VOIKE meta:", data.get("meta"))


if __name__ == "__main__":
  main()
