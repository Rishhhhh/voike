#!/usr/bin/env python3
"""
Python regression smoke-test for VOIKE-X.

It mirrors the TypeScript regression script but uses `requests` so you can
quickly validate a deployment from any environment (CI, laptop, etc.).
"""

import argparse
import os
import sys
import time
from typing import Any, Dict, Iterable, Optional

import requests

BASE_URL = os.environ.get("VOIKE_BASE_URL", "https://voike.supremeuf.com")
API_KEY = os.environ.get(
    "VOIKE_API_KEY",
    "4cdef1e80151bc5684e1edb20e502033515c5144dbb6180b8f27cbd0e3883369",
)
ADMIN_TOKEN = os.environ.get("VOIKE_ADMIN_TOKEN")
DEFAULT_HEADERS = {
    "x-voike-api-key": API_KEY,
    "content-type": "application/json",
}

CSV_SAMPLE = """id,name,score
1,Ada Lovelace,99
2,Grace Hopper,97
3,Katherine Johnson,95
"""


def request(
    method: str,
    path: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    json: Optional[Dict[str, Any]] = None,
    files: Optional[Dict[str, Any]] = None,
    data: Optional[Any] = None,
    timeout: int = 60,
    auth_required: bool = True,
) -> Any:
    url = f"{BASE_URL}{path}"
    final_headers = {}
    if auth_required:
        final_headers.update(DEFAULT_HEADERS)
    # When uploading files, let requests set the multipart boundary.
    if files:
        final_headers.pop("content-type", None)
    if headers:
        final_headers.update(headers)
    resp = requests.request(
        method,
        url,
        headers=final_headers,
        json=json,
        files=files,
        data=data,
        timeout=timeout,
    )
    if not resp.ok:
        raise RuntimeError(f"{method} {path} failed: {resp.status_code} {resp.text}")
    if resp.headers.get("content-type", "").startswith("application/json"):
        return resp.json()
    return resp.text


def wait_for_ingest(job_id: str, attempts: int = 30, delay_seconds: float = 1.0) -> Any:
    for _ in range(attempts):
        job = request("GET", f"/ingest/{job_id}")
        status = job.get("status")
        if status in ("completed", "failed"):
            return job
        time.sleep(delay_seconds)
    raise TimeoutError(f"Ingest job {job_id} did not finish after {attempts} attempts.")


def run_fibonacci_sql(n: int = 100) -> str:
    sql = f"""
    WITH RECURSIVE fib(idx, a, b) AS (
      SELECT 0, 0::numeric, 1::numeric
      UNION ALL
      SELECT idx + 1, b, a + b
      FROM fib
      WHERE idx < {n}
    )
    SELECT a::text AS fib_value
    FROM fib
    WHERE idx = {n};
    """
    payload = {"kind": "sql", "sql": sql}
    result = request("POST", "/query", json=payload)
    rows = result.get("rows") or []
    if not rows:
        raise RuntimeError("Fibonacci query returned no rows.")
    return rows[0]["fib_value"]


def mcp_execute(name: str, input_payload: Dict[str, Any]) -> Any:
    body = {
        "name": name,
        "input": input_payload,
        "context": {"sessionId": "py-regression"},
    }
    return request("POST", "/mcp/execute", json=body)


def run_regression(args: argparse.Namespace) -> None:
    print(f"Running regression against {BASE_URL}")

    # Health + info
    health = request("GET", "/health", auth_required=False)
    print("Health:", health)
    info = request("GET", "/info", auth_required=False)
    print("Available endpoints:", list(info.get("endpoints", {}).keys()))

    kernel_state = request("GET", "/kernel/state")
    print("Kernel state:", kernel_state)

    # Ingestion
    print("Uploading sample CSV via /ingest/file …")
    files = {
        "file": ("regression.csv", CSV_SAMPLE.encode("utf-8"), "text/csv"),
    }
    ingest_resp = request(
        "POST", "/ingest/file", files=files, auth_required=True, headers={}
    )
    job_id = ingest_resp["jobId"]
    print("Ingest accepted:", ingest_resp)
    job = wait_for_ingest(job_id)
    if job.get("status") != "completed":
        raise RuntimeError(f"Ingest job ended in unexpected state: {job}")
    summary = job.get("summary", {})
    print("Ingest summary:", summary)

    # Query the ingested table
    table = summary.get("table")
    if not table:
        raise RuntimeError("Ingest summary missing table name.")
    query_payload = {
        "kind": "hybrid",
        "sql": f"SELECT * FROM {table} WHERE (score::numeric) > 95",
        "semanticText": "legendary scientist",
        "filters": {"entity_type": "profile"},
    }
    query_result = request("POST", "/query", json=query_payload)
    print("Hybrid query meta:", query_result.get("meta"))
    print("Hybrid query rows:", query_result.get("rows"))

    ledger = request("GET", "/ledger/recent")
    print(f"Ledger entries fetched: {len(ledger)}")
    if ledger:
        entry_id = ledger[0].get("id")
        if entry_id:
            detail = request("GET", f"/ledger/{entry_id}")
            if detail.get("id") != entry_id:
                raise RuntimeError("Ledger detail lookup mismatch.")
            print("Ledger detail lookup successful for entry:", entry_id)

    metrics = request("GET", "/metrics")
    print("Metrics keys:", list(metrics.keys()))

    tools = request("GET", "/mcp/tools")
    tool_names = [tool["name"] for tool in tools]
    print("Registered MCP tools:", tool_names)
    if "db.query" in tool_names:
        mcp_result = mcp_execute(
            "db.query",
            {"query": {"kind": "sql", "sql": "SELECT 42 AS answer"}},
        )
        print("MCP db.query result:", mcp_result)
    if "kernel.getEnergy" in tool_names:
        energy = mcp_execute("kernel.getEnergy", {})
        print("MCP kernel.getEnergy result:", energy)

    if args.fibonacci:
        fib_val = run_fibonacci_sql(args.fibonacci)
        print(f"fib({args.fibonacci}) =", fib_val)

    # Security regression: missing API key should 401.
    resp = requests.get(f"{BASE_URL}/kernel/state", timeout=10)
    if resp.status_code != 401:
        raise RuntimeError(f"Expected 401 for missing API key, got {resp.status_code}")
    print("Unauthorized access correctly rejected (401).")

    # Optional admin checks
    if ADMIN_TOKEN:
        admin_headers = {"x-voike-admin-token": ADMIN_TOKEN}
        waitlist = request(
            "GET", "/admin/waitlist", headers=admin_headers, auth_required=False
        )
        print("Admin waitlist entries:", len(waitlist))
    else:
        print("Skipping admin checks (VOIKE_ADMIN_TOKEN not set).")

    print("Python regression completed successfully ✅")


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="VOIKE-X regression tester (Python).",
    )
    parser.add_argument(
        "--fibonacci",
        type=int,
        default=100,
        help="Run an additional Fibonacci SQL query at the given index.",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    if not API_KEY:
        print("VOIKE_API_KEY env var must be set.", file=sys.stderr)
        sys.exit(1)
    args = parse_args()
    try:
        run_regression(args)
    except Exception as exc:  # pragma: no cover - manual script
        print("Regression failed:", exc, file=sys.stderr)
        sys.exit(1)
