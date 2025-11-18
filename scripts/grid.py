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


def submit_fib_job(n: int, mode: str, chunk_size: int) -> str:
    if mode == "split":
        payload = {
            "type": "custom",
            "params": {"task": "fib_split", "n": n, "chunkSize": chunk_size},
        }
    else:
        payload = {
            "type": "custom",
            "params": {"task": "fib", "n": n},
        }
    response = request("POST", "/grid/jobs", json=payload)
    job_id = response["jobId"]
    print(f"[grid] submitted jobId={job_id} (mode={mode}, n={n})")
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
    parser.add_argument(
        "--mode",
        choices=["single", "split"],
        default="split",
        help="Use single job or split job that maps to multiple nodes.",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=500,
        help="Chunk size for split mode (number of Fibonacci steps per segment).",
    )
    parser.add_argument(
        "--show-segments",
        action="store_true",
        help="Fetch each segment job and print the assigned node.",
    )
    args = parser.parse_args()

    if not API_KEY:
        print("VOIKE_API_KEY must be set", file=sys.stderr)
        sys.exit(1)

    job_id = submit_fib_job(args.n, args.mode, args.chunk_size)
    job = wait_for_job(job_id)
    result_payload = job.get("result") or {}
    result = result_payload.get("fib")
    print(f"[grid] final status={job.get('status')} fib={result} assignedNode={job.get('assigned_node_id')}")
    segments = result_payload.get("segments") or []
    if segments:
        print(f"[grid] job spawned {len(segments)} segment jobs")
        if args.show_segments:
            for seg_id in segments:
                seg_job = request("GET", f"/grid/jobs/{seg_id}")
                print(
                    f"   segment {seg_id[:8]} status={seg_job.get('status')} node={seg_job.get('assigned_node_id')}"
                )
    local = fibonacci_local(args.n)
    if result is None:
        print("[grid] remote job did not return fib result (server missing handler?)")
    elif result == local:
        print("[grid] ✅ matches local computation")
    else:
        print(f"[grid] ⚠ mismatch: remote={result[:32]}… local={local[:32]}…")


if __name__ == "__main__":
    main()
