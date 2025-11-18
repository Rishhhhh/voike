#!/usr/bin/env python3
"""Lightweight VOIKE heartbeat checker.

This script hits a small subset of Core and AI endpoints to verify that
the deployment is healthy. It is intentionally faster/cheaper than the full
regression harness so operators can run it every few minutes (cron, CI, etc.).

It exits with code 0 on success and non-zero on the first failure.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

import requests


def load_local_env() -> None:
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_local_env()

BASE_URL = os.environ.get("VOIKE_BASE_URL", "http://localhost:8080")
API_KEY = os.environ.get("VOIKE_API_KEY")


def _request(method: str, path: str, *, json_payload: Optional[dict[str, Any]] = None) -> Any:
    if not API_KEY:
        raise RuntimeError("VOIKE_API_KEY must be set for heartbeat checks")
    url = f"{BASE_URL}{path}"
    headers = {
        "x-voike-api-key": API_KEY,
        "content-type": "application/json",
    }
    resp = requests.request(method, url, headers=headers, json=json_payload, timeout=30)
    if not resp.ok:
        raise RuntimeError(f"{method} {path} failed: {resp.status_code} {resp.text}")
    if resp.headers.get("content-type", "").startswith("application/json"):
        return resp.json()
    return resp.text


def check_health() -> None:
    resp = requests.get(f"{BASE_URL}/health", timeout=10)
    data = resp.json()
    if data.get("status") != "ok":
        raise RuntimeError(f"/health status not ok: {json.dumps(data)}")
    print("[OK] /health", data)


def check_query() -> None:
    payload = {"kind": "sql", "sql": "SELECT 1"}
    resp = _request("POST", "/query", json_payload=payload)
    rows = resp.get("rows", [])
    if not rows or rows[0].get("?column?") not in ("1", 1):
        raise RuntimeError(f"Unexpected /query response: {resp}")
    print("[OK] /query", rows)


def check_ai_policy() -> None:
    policy = _request("GET", "/ai/policy")
    mode = policy.get("mode")
    if mode not in ("none", "metadata", "summaries", "full"):
        raise RuntimeError(f"Invalid AI policy mode: {policy}")
    print("[OK] /ai/policy", mode)


def check_ai_ask() -> None:
    payload = {"question": "heartbeat status"}
    resp = _request("POST", "/ai/ask", json_payload=payload)
    answers = resp.get("answers", [])
    if not isinstance(answers, list):
        raise RuntimeError(f"Invalid /ai/ask payload: {resp}")
    print(f"[OK] /ai/ask answers={len(answers)} policy={resp.get('policy')}")


def check_ai_heatmap() -> None:
    resp = _request("GET", "/ai/irx/heatmap")
    print(f"[OK] /ai/irx/heatmap objects={len(resp.get('objects', []))}")


def check_ai_pipelines() -> None:
    resp = _request("POST", "/ai/pipelines/analyze", json_payload={})
    print(f"[OK] /ai/pipelines/analyze proposals={len(resp.get('proposals', []))}")


def main() -> None:
    try:
        check_health()
        check_query()
        check_ai_policy()
        check_ai_ask()
        check_ai_heatmap()
        check_ai_pipelines()
    except Exception as exc:  # pragma: no cover - heartbeat failure path
        print(f"Heartbeat failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    if not API_KEY:
        print("VOIKE_API_KEY must be set before running heartbeat", file=sys.stderr)
        sys.exit(1)
    main()
