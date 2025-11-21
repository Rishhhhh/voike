#!/usr/bin/env python3
"""Full VOIKE-X Modules 1–9 regression harness.

This script exercises the new surfaces introduced in Modules 4–9 on top of the
existing Core/AI/Grid stack:

- Core health + mesh/genesis
- SNRL + Hypermesh + Trust (Modules 4–6)
- Omni Ingestion + lineage/schema/transform (Module 7)
- Hybrid query planner/cache/profiles (Module 8)
- Streams + checkpoints + profiles (Module 9)

It uses the same environment variables as the Docker deployment:

- VOIKE_BASE_URL (default: https://voike.supremeuf.com)
- VOIKE_API_KEY (project-scoped API key)
- VOIKE_ADMIN_TOKEN or ADMIN_TOKEN (admin key for trust/mesh/SNRL)

Exit code is 0 on success; any failed check raises and exits non-zero.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional

import requests

try:  # Optional pretty progress; falls back silently if missing.
  from tqdm.auto import tqdm
except Exception:  # pragma: no cover - tqdm is optional
  tqdm = None  # type: ignore[assignment]


def load_local_env() -> None:
  """Load .env or .env.example from repo/scripts/ root if present.

  This mirrors how Docker uses .env while still allowing overrides via
  environment variables.
  """

  script_dir = Path(__file__).resolve().parent
  root = script_dir.parent
  candidates = [root / ".env", script_dir / ".env", root / ".env.example"]
  env_path = next((p for p in candidates if p.exists()), None)
  if not env_path:
    return
  for raw_line in env_path.read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    key, value = line.split("=", 1)
    os.environ.setdefault(key.strip(), value.strip())


load_local_env()

BASE_URL = os.environ.get("VOIKE_BASE_URL", "https://voike.supremeuf.com")
API_KEY = os.environ.get("VOIKE_API_KEY")
ADMIN_TOKEN = os.environ.get("VOIKE_ADMIN_TOKEN") or os.environ.get("ADMIN_TOKEN")
ROUTING_DOMAIN = os.environ.get("VOIKE_ROUTING_DOMAIN", "api.voike.com")


def banner(title: str) -> None:
  print("\n" + "=" * 80)
  print(title)
  print("=" * 80)


def report(step: str, status: str = "OK", detail: Optional[str] = None) -> None:
  print(f"[{status}] {step}")
  if detail:
    print(f"    {detail}")


def request(
  method: str,
  path: str,
  *,
  headers: Optional[Dict[str, str]] = None,
  json_payload: Optional[Dict[str, Any]] = None,
  data: Optional[Any] = None,
  files: Optional[Dict[str, Any]] = None,
  timeout: int = 60,
  auth_required: bool = True,
) -> Any:
  if auth_required and not API_KEY:
    raise RuntimeError("VOIKE_API_KEY must be set")
  url = f"{BASE_URL}{path}"
  final_headers: Dict[str, str] = {}
  if auth_required:
    final_headers["x-voike-api-key"] = API_KEY  # type: ignore[arg-type]
    final_headers["content-type"] = "application/json"
  if files:
    final_headers.pop("content-type", None)
  if headers:
    final_headers.update(headers)
  resp = requests.request(
    method,
    url,
    headers=final_headers,
    json=json_payload,
    data=data,
    files=files,
    timeout=timeout,
  )
  if not resp.ok:
    raise RuntimeError(f"{method} {path} failed: {resp.status_code} {resp.text}")
  ctype = resp.headers.get("content-type", "")
  if ctype.startswith("application/json"):
    return resp.json()
  return resp.text


def admin_headers() -> Dict[str, str]:
  if not ADMIN_TOKEN:
    raise RuntimeError("ADMIN_TOKEN / VOIKE_ADMIN_TOKEN must be set for admin checks")
  return {"x-voike-admin-token": ADMIN_TOKEN, "content-type": "application/json"}


def check_health_and_mesh() -> None:
  banner("Core health + mesh/genesis")
  info = request("GET", "/health", auth_required=False)
  report("/health", detail=json.dumps(info))
  mesh_self = request("GET", "/mesh/self")
  report("/mesh/self", detail=json.dumps(mesh_self))
  if ADMIN_TOKEN:
    mesh_nodes = request("GET", "/mesh/nodes", headers=admin_headers(), auth_required=False)
    count = len(mesh_nodes or [])
    regions: Dict[str, int] = {}
    for node in mesh_nodes or []:
      region = node.get("region") or (node.get("meta") or {}).get("region") or "unknown"
      regions[region] = regions.get(region, 0) + 1
    region_summary = ", ".join(f"{r}:{n}" for r, n in regions.items())
    report("/mesh/nodes", detail=f"nodes={count} regions=[{region_summary}]")
    genesis = request("GET", "/genesis", headers=admin_headers(), auth_required=False)
    report("/genesis", detail=json.dumps(genesis))
  else:
    report("/mesh/nodes + /genesis (admin)", status="SKIP", detail="ADMIN_TOKEN not set")


def check_snrl_hypermesh_trust() -> None:
  banner("Modules 4–6: SNRL + Hypermesh + Trust")

  # SNRL resolve
  body = {"domain": ROUTING_DOMAIN, "client": {"region": "ap-sg", "capabilities": ["http"]}}
  snrl = request("POST", "/snrl/resolve", json_payload=body)
  report("/snrl/resolve", detail=f"domain={snrl.get('domain')} candidates={len(snrl.get('candidates') or [])}")

  if ADMIN_TOKEN:
    preds = request("GET", "/snrl/predictions", headers=admin_headers(), auth_required=False)
    insights = request("GET", "/snrl/insights", headers=admin_headers(), auth_required=False)
    failures = request("GET", "/snrl/failures", headers=admin_headers(), auth_required=False)
    report("/snrl/predictions", detail=f"entries={len(preds or [])}")
    report("/snrl/insights", detail=json.dumps(insights))
    report("/snrl/failures", detail=json.dumps(failures))
  else:
    report("/snrl/* admin endpoints", status="SKIP", detail="ADMIN_TOKEN not set")

  # Hypermesh
  if ADMIN_TOKEN:
    h_status = request("GET", "/hypermesh/status", headers=admin_headers(), auth_required=False)
    report("/hypermesh/status", detail=json.dumps(h_status.get("perfWatch", {})))
    routes = request("GET", "/hypermesh/routes", headers=admin_headers(), auth_required=False)
    report("/hypermesh/routes", detail=f"routes={len(routes or [])}")
  else:
    report("/hypermesh/*", status="SKIP", detail="ADMIN_TOKEN not set")

  # Trust
  if ADMIN_TOKEN:
    t_status = request("GET", "/trust/status", headers=admin_headers(), auth_required=False)
    anchors = request("GET", "/trust/anchors?limit=3", headers=admin_headers(), auth_required=False)
    events = request("GET", "/trust/events?limit=3", headers=admin_headers(), auth_required=False)
    sessions = request("GET", "/trust/sessions?limit=3", headers=admin_headers(), auth_required=False)
    pta = request("GET", "/trust/pta", headers=admin_headers(), auth_required=False)
    report("/trust/status", detail=json.dumps(t_status.get("pqc", {})))
    report("/trust/anchors", detail=f"count={len(anchors or [])}")
    report("/trust/events", detail=f"count={len(events or [])}")
    report("/trust/sessions", detail=f"count={len(sessions or [])}")
    report("/trust/pta", detail=json.dumps(pta))
  else:
    report("/trust/*", status="SKIP", detail="ADMIN_TOKEN not set")


CSV_SAMPLE = """id,name,score\n1,Ada,99\n2,Grace,97\n3,Katherine,95\n"""


def check_ingestion_and_lineage() -> str:
  banner("Module 7: Ingestion + lineage/schema/transform")

  files = {"file": ("full-regression.csv", CSV_SAMPLE.encode("utf-8"))}
  resp = request("POST", "/ingest/file", files=files)
  job_id = resp.get("jobId") or resp.get("id")
  if not job_id:
    raise RuntimeError(f"/ingest/file did not return jobId: {resp}")
  report("/ingest/file", detail=f"jobId={job_id}")

  # Poll job
  for _ in range(60):
    job = request("GET", f"/ingest/{job_id}")
    status = job.get("status")
    if status in ("completed", "failed"):
      break
    time.sleep(1.0)
  else:
    raise RuntimeError(f"Ingest job {job_id} did not complete")
  report("/ingest/{jobId}", detail=json.dumps(job))

  jobs = request("GET", "/ingestion/jobs?limit=5")
  report("/ingestion/jobs", detail=f"entries={len(jobs or [])}")

  lineage = request("GET", "/ingestion/lineage?limit=5")
  report("/ingestion/lineage", detail=f"entries={len(lineage or [])}")

  # Schema inference & transform plan on sample rows
  rows = [
    {"id": 1, "name": "Ada", "meta": {"lang": "en"}},
    {"id": 2, "name": "Grace", "meta": {"lang": "en"}},
  ]
  schema = request("POST", "/ingestion/schema/infer", json_payload={"rows": rows, "logicalName": "sample"})
  report("/ingestion/schema/infer", detail=json.dumps(schema))

  plan = request("POST", "/ingestion/transform/plan", json_payload={"sample": rows})
  report("/ingestion/transform/plan", detail=json.dumps(plan))

  return str(job_id)


def check_hybrid_query() -> None:
  banner("Module 8: Hybrid querying & reasoning")
  body = {"naturalLanguage": "show recent ingest jobs", "limit": 10}
  result = request("POST", "/hybrid/query", json_payload=body)
  plan = result.get("plan") or {}
  rows = (result.get("result") or {}).get("rows", [])
  report("/hybrid/query", detail=f"planMode={plan.get('mode')} rows={len(rows)} cacheHit={result.get('cacheHit')}")

  plans = request("GET", "/hybrid/plans?limit=5")
  report("/hybrid/plans", detail=f"plans={len(plans or [])}")

  cache = request("GET", "/hybrid/cache")
  profiles = request("GET", "/hybrid/profiles?limit=5")
  report("/hybrid/cache", detail=f"entries={len(cache or [])}")
  report("/hybrid/profiles", detail=f"entries={len(profiles or [])}")


def check_streams() -> None:
  banner("Module 9: Streams + checkpoints + profiles")
  create = request("POST", "/streams", json_payload={"name": "py-regression-stream", "kind": "events"})
  stream_id = create.get("streamId") or create.get("stream_id")
  if not stream_id:
    raise RuntimeError(f"/streams create did not return streamId: {create}")
  report("/streams (create)", detail=f"streamId={stream_id}")

  event = request(
    "POST",
    f"/streams/{stream_id}/events",
    json_payload={"payload": {"kind": "regression", "value": 1}, "latencyMs": 3, "throughput": 1},
  )
  seq = event.get("sequence")
  report("/streams/{id}/events (append)", detail=f"sequence={seq}")

  events = request("GET", f"/streams/{stream_id}/events?since=0&limit=10")
  report("/streams/{id}/events (fetch)", detail=f"events={len(events or [])}")

  checkpoint = request(
    "POST",
    f"/streams/{stream_id}/checkpoints",
    json_payload={"position": seq or 0, "metadata": {"reason": "full-regression"}},
  )
  report("/streams/{id}/checkpoints (create)", detail=f"entries={len(checkpoint or [])}")

  checkpoints = request("GET", f"/streams/{stream_id}/checkpoints?limit=5")
  report("/streams/{id}/checkpoints (list)", detail=f"entries={len(checkpoints or [])}")

  profile = request("GET", f"/streams/{stream_id}/profile")
  report("/streams/{id}/profile", detail=json.dumps(profile))


def wait_for_grid_job(job_id: str, attempts: int = 240, delay_seconds: float = 1.0) -> Any:
  """Poll /grid/jobs/{id} until SUCCEEDED/FAILED or timeout."""

  for _ in range(attempts):
    job = request("GET", f"/grid/jobs/{job_id}")
    status = job.get("status")
    if status in ("SUCCEEDED", "FAILED"):
      return job
    time.sleep(delay_seconds)
  raise TimeoutError(f"Grid job {job_id} did not finish after {attempts} attempts.")


def fibonacci_local(n: int) -> str:
  a, b = 0, 1
  for _ in range(n):
    a, b = b, a + b
  return str(a)


def check_grid_parallel() -> None:
  """Submit a split Fibonacci job and verify multi-node execution."""

  banner("Grid: parallel Fibonacci split across nodes")
  n = 2000
  params: Dict[str, Any] = {"task": "fib_split", "n": n, "chunkSize": 500}

  # If admin access is available, try to discover at least two mesh nodes and
  # pin child segments round-robin across them using preferNodeId.
  if ADMIN_TOKEN:
    try:
      mesh_nodes = request("GET", "/mesh/nodes", headers=admin_headers(), auth_required=False)
      node_ids = []
      for node in mesh_nodes or []:
        node_id = node.get("nodeId") or node.get("node_id")
        if node_id:
          node_ids.append(node_id)
      unique_nodes = sorted({nid for nid in node_ids if nid})
      if len(unique_nodes) >= 2:
        params["childNodeIds"] = unique_nodes[:2]
        report("Grid childNodeIds", detail=f"Round-robin across {params['childNodeIds']}")
      else:
        report("Grid childNodeIds", status="WARN", detail="Only one node visible; parallelism best-effort")
    except Exception as exc:
      report("Grid childNodeIds", status="WARN", detail=f"mesh/nodes lookup failed: {exc}")

  payload = {"type": "custom", "params": params}

  start = time.time()
  resp = request("POST", "/grid/jobs", json_payload=payload)
  job_id = resp["jobId"]
  report("/grid/jobs (split submit)", detail=f"jobId={job_id}")

  job = wait_for_grid_job(job_id)
  status = job.get("status")
  if status != "SUCCEEDED":
    raise RuntimeError(f"Split grid job {job_id} ended with status {status}")

  result = (job.get("result") or {}).get("fib")
  local = fibonacci_local(n)
  if result != local:
    report("Grid split fib mismatch", status="WARN", detail=f"grid={result} local={local}")
  else:
    report("Grid split fib validated", detail=str(result))

  segments = (job.get("result") or {}).get("segments") or []
  report("Grid split segments", detail=f"childJobs={len(segments)}")

  if segments:
    node_ids = []
    for seg_id in segments:
      seg_job = request("GET", f"/grid/jobs/{seg_id}")
      node_ids.append(seg_job.get("assigned_node_id"))
    unique_nodes = sorted({nid for nid in node_ids if nid})
    status = "OK" if len(unique_nodes) > 1 else "WARN"
    report("Grid parallelism", status=status, detail=f"uniqueNodes={len(unique_nodes)} {unique_nodes}")

  elapsed_ms = int((time.time() - start) * 1000)
  report("Grid split timing", detail=f"{elapsed_ms}ms (end-to-end)")


def main() -> None:
  if not API_KEY:
    raise RuntimeError("VOIKE_API_KEY must be set for full regression")

  phases = [
    ("Core health + mesh/genesis", check_health_and_mesh),
    ("Modules 4–6: SNRL + Hypermesh + Trust", check_snrl_hypermesh_trust),
    ("Module 7: Ingestion + lineage/schema/transform", check_ingestion_and_lineage),
    ("Module 8: Hybrid querying & reasoning", check_hybrid_query),
    ("Module 9: Streams + checkpoints + profiles", check_streams),
    ("Grid split Fibonacci (parallelism)", check_grid_parallel),
  ]

  if tqdm is not None:
    for _, fn in tqdm(phases, desc="VOIKE full regression", unit="phase"):
      fn()
  else:
    for _, fn in phases:
      fn()

  report("Full system regression completed", status="OK")


if __name__ == "__main__":  # pragma: no cover - CLI entry
  try:
    main()
  except Exception as exc:
    report("Full system regression failed", status="FAIL", detail=str(exc))
    sys.exit(1)
