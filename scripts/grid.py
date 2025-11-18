#!/usr/bin/env python3
"""
Minimal helper for exercising VOIKE grid jobs.

Usage:
  python scripts/grid.py --n 2000

Reads VOIKE_BASE_URL / VOIKE_API_KEY from env (falls back to prod playground).
"""

import argparse
import os
import sys
import time
from typing import Any, Dict, Optional

import requests

BASE_URL = os.environ.get("VOIKE_BASE_URL", "https://voike.supremeuf.com")
API_KEY = os.environ.get(
    "VOIKE_API_KEY",
    "4cdef1e80151bc5684e1edb20e502033515c5144dbb6180b8f27cbd0e3883369",
)


def request(method: str, path: str, json: Optional[Dict[str, Any]] = None):
    url = f"{BASE_URL}{path}"
    headers = {"x-voike-api-key": API_KEY, "content-type": "application/json"}
    resp = requests.request(method, url, headers=headers, json=json, timeout=60)
    if not resp.ok:
        raise RuntimeError(f"{method} {path} failed: {resp.status_code} {resp.text}")
    return resp.json()


def submit_fib_job(n: int) -> str:
    payload = {
        "type": "custom",
        "params": {"task": "fib", "n": n},
    }
    response = request("POST", "/grid/jobs", json=payload)
    job_id = response["jobId"]
    print(f"[grid] submitted jobId={job_id} (n={n})")
    return job_id


def wait_for_job(job_id: str, timeout: int = 180) -> Dict[str, Any]:
    start = time.time()
    while time.time() - start < timeout:
        job = request("GET", f"/grid/jobs/{job_id}")
        status = job.get("status")
        if status in ("SUCCEEDED", "FAILED"):
            return job
        print(f"[grid] job status={status} …")
        time.sleep(1.0)
    raise TimeoutError(f"Grid job {job_id} did not finish within {timeout}s")


def fibonacci_local(n: int) -> str:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return str(a)


def main():
    parser = argparse.ArgumentParser(description="VOIKE grid fib tester")
    parser.add_argument("--n", type=int, default=2000, help="Fibonacci index to compute")
    args = parser.parse_args()

    if not API_KEY:
        print("VOIKE_API_KEY must be set", file=sys.stderr)
        sys.exit(1)

    job_id = submit_fib_job(args.n)
    job = wait_for_job(job_id)
    result = (job.get("result") or {}).get("fib")
    print(f"[grid] final status={job.get('status')} fib={result}")
    local = fibonacci_local(args.n)
    if result is None:
        print("[grid] remote job did not return fib result (server missing handler?)")
    elif result == local:
        print("[grid] ✅ matches local computation")
    else:
        print(f"[grid] ⚠ mismatch: remote={result[:32]}… local={local[:32]}…")


if __name__ == "__main__":
    main()
