#!/usr/bin/env python3
"""
Mesh/RPC diagnostic helper for VOIKE deployments.

It summarizes node/cluster state, routing metadata, and (optionally) fires a
split Fibonacci grid job so you can verify that work fans out across nodes.
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

# Python 3.11+ protects against huge int->str conversions. Disable the guard so
# fib(5000)+ comparisons work without raising.
if hasattr(sys, "set_int_max_str_digits"):
    try:
        sys.set_int_max_str_digits(0)
    except (ValueError, AttributeError):
        pass


def load_local_env() -> None:
    script_dir = Path(__file__).resolve().parent
    candidates = [script_dir / ".env", script_dir.parent / ".env"]
    for path in candidates:
        if not path.exists():
            continue
        for raw_line in path.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())
        break


load_local_env()

DEFAULT_BASE_URL = os.environ.get("VOIKE_BASE_URL", "https://voike.supremeuf.com")
DEFAULT_API_KEY = os.environ.get(
    "VOIKE_API_KEY",
    "4cdef1e80151bc5684e1edb20e502033515c5144dbb6180b8f27cbd0e3883369",
)
DEFAULT_ADMIN_TOKEN = os.environ.get("VOIKE_ADMIN_TOKEN") or os.environ.get("ADMIN_TOKEN")
DEFAULT_ROUTING_DOMAIN = os.environ.get("VOIKE_ROUTING_DOMAIN", "api.voike.com")
DEFAULT_VDNS_ZONE = os.environ.get("VDNS_ZONE_ID", "voike-com")


class VoikeClient:
    def __init__(self, base_url: str, api_key: Optional[str], admin_token: Optional[str]):
        if not base_url:
            raise ValueError("Base URL is required (set VOIKE_BASE_URL or --base-url).")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.admin_token = admin_token
        self._session = requests.Session()

    def request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[Dict[str, Any]] = None,
        data: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        auth: Optional[str] = "project",
        timeout: int = 60,
    ) -> Any:
        url = f"{self.base_url}{path}"
        final_headers = {"content-type": "application/json"}
        if headers:
            final_headers.update(headers)
        if auth == "project":
            if not self.api_key:
                raise RuntimeError("Project API key missing (set VOIKE_API_KEY or --api-key).")
            final_headers["x-voike-api-key"] = self.api_key
        elif auth == "admin":
            if not self.admin_token:
                raise RuntimeError("Admin token missing (set VOIKE_ADMIN_TOKEN or --admin-token).")
            final_headers["x-voike-admin-token"] = self.admin_token
        elif auth is None:
            pass
        else:
            raise ValueError(f"Unsupported auth mode: {auth}")

        if json is not None:
            data = None
        try:
            resp = self._session.request(
                method,
                url,
                json=json,
                data=data,
                headers=final_headers,
                timeout=timeout,
            )
        except requests.RequestException as exc:
            raise RuntimeError(f"Request to {path} failed: {exc}") from exc
        if not resp.ok:
            raise RuntimeError(f"{method} {path} failed: {resp.status_code} {resp.text}")

        content_type = resp.headers.get("content-type", "")
        if content_type.startswith("application/json"):
            return resp.json()
        return resp.text


def banner(title: str) -> None:
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)


def parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def format_delta(seconds: Optional[float]) -> str:
    if seconds is None:
        return "unknown"
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes = seconds / 60.0
    if minutes < 60:
        return f"{minutes:.1f}m"
    hours = minutes / 60.0
    return f"{hours:.1f}h"


def show_cluster_overview(client: VoikeClient) -> None:
    banner("Cluster overview")
    try:
        info = client.request("GET", "/info", auth=None)
        env = info.get("env")
        version = info.get("version")
        print(f"Base URL     : {client.base_url}")
        if version:
            print(f"Docs version : {version}")
        if env:
            print(f"Env payload  : {env}")
    except RuntimeError as exc:
        print(f"/info        : unable to fetch ({exc})")

    if client.admin_token:
        try:
            genesis = client.request("GET", "/genesis", auth="admin")
            cluster_id = genesis.get("clusterId")
            replication = genesis.get("replication", {})
            repl_desc = replication.get("type")
            if replication.get("r"):
                repl_desc = f"{repl_desc} r={replication['r']}"
            if replication.get("k"):
                repl_desc = f"{repl_desc} k={replication['k']}"
            print(f"Genesis      : cluster={cluster_id} version={genesis.get('version')} replication={repl_desc}")
        except RuntimeError as exc:
            print(f"Genesis      : {exc}")
    else:
        print("Genesis      : (skipped) VOIKE_ADMIN_TOKEN not configured")


def show_mesh_snapshot(client: VoikeClient, stale_seconds: float) -> List[Dict[str, Any]]:
    banner("Mesh + DB sync status")
    nodes: List[Dict[str, Any]] = []
    try:
        self_node = client.request("GET", "/mesh/self", auth=None)
        if self_node:
            print(
                f"Self node    : {self_node.get('nodeId')} cluster={self_node.get('clusterId')} "
                f"roles={','.join(self_node.get('roles', [])) or '-'} region={self_node.get('region') or '-'}"
            )
    except RuntimeError as exc:
        print(f"Self node    : {exc}")

    if not client.admin_token:
        print("Mesh nodes   : (skipped) VOIKE_ADMIN_TOKEN not configured")
        return nodes

    try:
        nodes = client.request("GET", "/mesh/nodes", auth="admin")
    except RuntimeError as exc:
        print(f"Mesh nodes   : unable to fetch ({exc})")
        return nodes

    now = datetime.now(timezone.utc)
    cluster_ids = set()
    stale_nodes: List[str] = []
    healthy_nodes = 0
    for node in sorted(nodes, key=lambda item: item.get("nodeId", "")):
        cluster_id = node.get("clusterId")
        if cluster_id:
            cluster_ids.add(cluster_id)
        last_seen = parse_timestamp(node.get("lastSeenAt"))
        age = (now - last_seen).total_seconds() if last_seen else None
        if age and age > stale_seconds:
            stale_nodes.append(node.get("nodeId", "unknown"))
        status = node.get("status", "unknown")
        if status.lower() == "healthy":
            healthy_nodes += 1
        region = node.get("region") or (node.get("meta") or {}).get("region") or "-"
        roles = ",".join(node.get("roles", [])) or "-"
        addr = (node.get("addresses") or {}).get("http") or "-"
        print(
            f" - {node.get('nodeId')} status={status:<8} lastSeen={format_delta(age)} "
            f"region={region} roles={roles} http={addr}"
        )

    db_sync_ok = len(cluster_ids) <= 1
    detail = "OK" if db_sync_ok else f"WARN (clusters={sorted(cluster_ids)})"
    print(f"DB sync      : {detail}")
    if stale_nodes:
        print(f"Stale nodes  : {stale_nodes} (> {stale_seconds}s since heartbeat)")
    print(f"Healthy nodes: {healthy_nodes}/{len(nodes)} visible")
    return nodes


def show_routing_snapshot(client: VoikeClient, domain: str, zone_id: str) -> None:
    banner("Routing snapshot (SNRL + VDNS)")
    if client.api_key:
        try:
            snrl = client.request(
                "POST",
                "/snrl/resolve",
                json={"domain": domain, "client": {"region": "rpc-probe", "capabilities": ["http", "gpu"]}},
            )
            candidates = snrl.get("candidates", [])
            ttl = snrl.get("ttl")
            if candidates:
                print(f"SNRL {domain}: {len(candidates)} candidates ttl={ttl}")
                for cand in candidates[:5]:
                    region = cand.get("meta", {}).get("region")
                    addr = cand.get("endpoint")
                    score = cand.get("score")
                    print(f"   - {addr} region={region} score={score}")
            else:
                print(f"SNRL {domain}: no candidates returned")
        except RuntimeError as exc:
            print(f"SNRL {domain}: {exc}")
    else:
        print("SNRL         : (skipped) VOIKE_API_KEY not configured")

    if client.admin_token:
        try:
            zone = client.request("GET", f"/vdns/zones/{zone_id}", auth="admin")
            records = zone.get("records", [])
            print(f"VDNS zone    : {zone_id} serial={zone.get('serial')} records={len(records)}")
        except RuntimeError as exc:
            print(f"VDNS zone    : {exc}")
    else:
        print("VDNS zone    : (skipped) VOIKE_ADMIN_TOKEN not configured")


def fibonacci_local(n: int) -> str:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return str(a)


def run_grid_probe(client: VoikeClient, n: Optional[int], chunk_size: int, show_segments: bool) -> None:
    if not n:
        return
    banner(f"Grid Fibonacci probe (n={n}, chunk={chunk_size})")
    if not client.api_key:
        print("Grid probe   : cannot run without VOIKE_API_KEY")
        return

    payload = {"type": "custom", "params": {"task": "fib_split", "n": n, "chunkSize": chunk_size}}
    try:
        job_resp = client.request("POST", "/grid/jobs", json=payload, auth="project")
    except RuntimeError as exc:
        print(f"Grid probe   : failed to submit job ({exc})")
        return

    job_id = job_resp.get("jobId")
    print(f"Submitted grid job: {job_id}")
    start = time.time()
    job = None
    while time.time() - start < 300:
        try:
            job = client.request("GET", f"/grid/jobs/{job_id}", auth="project")
        except RuntimeError as exc:
            print(f"Grid status  : {exc}")
            time.sleep(1.0)
            continue
        status = job.get("status")
        if status in ("SUCCEEDED", "FAILED"):
            break
        print(f"Grid status  : {status}")
        time.sleep(1.0)

    if not job:
        print("Grid probe   : job lookup failed")
        return

    print(f"Grid result  : status={job.get('status')} assignedNode={job.get('assigned_node_id')}")
    result_payload = job.get("result") or {}
    remote = result_payload.get("fib")
    local = fibonacci_local(n)
    if remote == local:
        print("Grid compare : ✅ matches local computation")
    else:
        print(f"Grid compare : mismatch (remote={remote} local={local})")

    segments: List[str] = result_payload.get("segments") or []
    if not segments:
        print("Grid segments: (none reported)")
        return

    print(f"Grid segments: {len(segments)} child jobs spawned")
    if not show_segments:
        print("Grid segments: re-run with --show-segments to fetch per-node dispatch")
        return

    node_counts: Dict[str, int] = {}
    for seg_id in segments:
        try:
            seg_job = client.request("GET", f"/grid/jobs/{seg_id}", auth="project")
        except RuntimeError as exc:
            print(f"   segment {seg_id[:8]}: {exc}")
            continue
        assigned = seg_job.get("assigned_node_id") or "unknown"
        status = seg_job.get("status")
        node_counts[assigned] = node_counts.get(assigned, 0) + 1
        print(f"   segment {seg_id[:8]} status={status} node={assigned}")
    print(f"Grid split   : distribution {node_counts}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect VOIKE mesh/routing state and run grid probes.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="VOIKE base URL (env VOIKE_BASE_URL)")
    parser.add_argument("--api-key", default=DEFAULT_API_KEY, help="Project API key (env VOIKE_API_KEY)")
    parser.add_argument(
        "--admin-token",
        default=DEFAULT_ADMIN_TOKEN,
        help="Admin token for mesh/VDNS APIs (env VOIKE_ADMIN_TOKEN)",
    )
    parser.add_argument(
        "--routing-domain",
        default=DEFAULT_ROUTING_DOMAIN,
        help="Domain to resolve via /snrl/resolve (env VOIKE_ROUTING_DOMAIN)",
    )
    parser.add_argument(
        "--vdns-zone",
        default=DEFAULT_VDNS_ZONE,
        help="VDNS zone ID to inspect (env VDNS_ZONE_ID)",
    )
    parser.add_argument(
        "--grid",
        type=int,
        default=None,
        help="Optional Fibonacci target for a split grid job (e.g. 5000).",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=500,
        help="Chunk size for split grid jobs (default: 500).",
    )
    parser.add_argument(
        "--show-segments",
        action="store_true",
        help="Fetch every child grid job and print assigned node IDs.",
    )
    parser.add_argument(
        "--stale-seconds",
        type=float,
        default=30.0,
        help="Threshold before a node heartbeat is considered stale.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    client = VoikeClient(args.base_url, args.api_key, args.admin_token)
    show_cluster_overview(client)
    show_mesh_snapshot(client, args.stale_seconds)
    show_routing_snapshot(client, args.routing_domain, args.vdns_zone)
    run_grid_probe(client, args.grid, args.chunk_size, args.show_segments)


if __name__ == "__main__":
    main()
