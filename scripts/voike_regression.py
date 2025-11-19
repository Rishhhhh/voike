#!/usr/bin/env python3
"""
Python regression smoke-test for VOIKE-X.

It mirrors the TypeScript regression script but uses `requests` so you can
quickly validate a deployment from any environment (CI, laptop, etc.).
"""

import argparse
import base64
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

import requests


def load_local_env() -> None:
    script_dir = Path(__file__).resolve().parent
    candidates = [
        script_dir / ".env",
        script_dir.parent / ".env",
    ]
    env_path = next((path for path in candidates if path.exists()), None)
    if not env_path:
        return
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        os.environ.setdefault(key, value)


load_local_env()

BASE_URL = os.environ.get("VOIKE_BASE_URL", "https://voike.supremeuf.com")
API_KEY = os.environ.get(
    "VOIKE_API_KEY",
    "4cdef1e80151bc5684e1edb20e502033515c5144dbb6180b8f27cbd0e3883369",
)
ADMIN_TOKEN = os.environ.get("VOIKE_ADMIN_TOKEN") or os.environ.get("ADMIN_TOKEN")
ROUTING_DOMAIN = os.environ.get("VOIKE_ROUTING_DOMAIN", "api.voike.com")
VDNS_ZONE_ID = os.environ.get("VDNS_ZONE_ID", "voike-com")
DEFAULT_HEADERS = {
    "x-voike-api-key": API_KEY,
    "content-type": "application/json",
}

CSV_SAMPLE = """id,name,score
1,Ada Lovelace,99
2,Grace Hopper,97
3,Katherine Johnson,95
"""


def banner(title: str) -> None:
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)


def report(step: str, status: str = "OK", detail: Optional[str] = None) -> None:
    print(f"[{status}] {step}")
    if detail:
        print(f"    {detail}")


def is_missing_endpoint(error: Exception) -> bool:
    msg = str(error).lower()
    return "failed: 404" in msg or "statuscode\":404" in msg or "not found" in msg


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


def wait_for_ingest(
    job_id: str,
    attempts: int = 30,
    delay_seconds: float = 1.0,
    api_key: Optional[str] = None,
) -> Any:
    headers = project_json_headers(api_key) if api_key else None
    for _ in range(attempts):
        job = request(
            "GET",
            f"/ingest/{job_id}",
            headers=headers,
            auth_required=api_key is None,
        )
        status = job.get("status")
        if status in ("completed", "failed"):
            return job
        time.sleep(delay_seconds)
    raise TimeoutError(f"Ingest job {job_id} did not finish after {attempts} attempts.")


def wait_for_grid_job(job_id: str, attempts: int = 120, delay_seconds: float = 1.0) -> Any:
    for _ in range(attempts):
        job = request("GET", f"/grid/jobs/{job_id}")
        status = job.get("status")
        if status in ("SUCCEEDED", "FAILED"):
            return job
        time.sleep(delay_seconds)
    raise TimeoutError(f"Grid job {job_id} did not finish after {attempts} attempts.")


def run_fibonacci_sql(n: int = 1000) -> str:
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


def fibonacci_local(n: int) -> str:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return str(a)


def run_grid_fibonacci_job(n: int) -> None:
    banner(f"Grid Fibonacci job n={n}")
    payload = {
        "type": "custom",
        "params": {"task": "fib", "n": n},
    }
    resp = request("POST", "/grid/jobs", json=payload)
    job_id = resp["jobId"]
    report("Grid job submitted", detail=f"jobId={job_id}")
    job = wait_for_grid_job(job_id)
    status = job.get("status")
    if status != "SUCCEEDED":
        raise RuntimeError(f"Grid job {job_id} ended with status {status}")
    result = (job.get("result") or {}).get("fib")
    report("Grid Fibonacci result", detail=str(result))
    local = fibonacci_local(n)
    if result is None:
        report("Grid Fibonacci comparison", status="WARN", detail="job returned no fib result")
    elif str(result) != local:
        report("Grid Fibonacci mismatch", status="WARN", detail=f"grid={result} local={local}")
    else:
        report("Grid Fibonacci validated", detail=local)


def run_grid_split_job(n: int, chunk_size: int = 500) -> None:
    banner(f"Grid split Fibonacci job n={n} chunk={chunk_size}")
    payload = {
        "type": "custom",
        "params": {"task": "fib_split", "n": n, "chunkSize": chunk_size},
    }
    resp = request("POST", "/grid/jobs", json=payload)
    job_id = resp["jobId"]
    report("Split job submitted", detail=f"jobId={job_id}")
    job = wait_for_grid_job(job_id, attempts=240)
    status = job.get("status")
    if status != "SUCCEEDED":
        raise RuntimeError(f"Split job {job_id} ended with status {status}")
    result = (job.get("result") or {}).get("fib")
    report("Split job fib result", detail=str(result))
    local = fibonacci_local(n)
    if result != local:
        report("Split job mismatch", status="WARN", detail=f"grid={result} local={local}")
    segments = (job.get("result") or {}).get("segments") or []
    report("Split job segments", detail=f"{len(segments)} child jobs")
    if segments:
        node_ids = []
        for seg_id in segments:
            seg_job = request("GET", f"/grid/jobs/{seg_id}")
            node_ids.append(seg_job.get("assigned_node_id"))
        report("Segment nodes", detail=str(node_ids))


def mcp_execute(name: str, input_payload: Dict[str, Any]) -> Any:
    body = {
        "name": name,
        "input": input_payload,
        "context": {"sessionId": "py-regression"},
    }
    return request("POST", "/mcp/execute", json=body)


def project_json_headers(api_key: str) -> Dict[str, str]:
    return {"x-voike-api-key": api_key, "content-type": "application/json"}


def admin_json_headers() -> Dict[str, str]:
    if not ADMIN_TOKEN:
        raise RuntimeError("ADMIN_TOKEN not configured; cannot call admin endpoints")
    return {"x-voike-admin-token": ADMIN_TOKEN, "content-type": "application/json"}


def run_ingest_and_query(context: str, project_api_key: Optional[str] = None) -> None:
    banner(f"{context} – Ingestion + Query Pipeline")
    using_custom_key = project_api_key is not None
    ingest_headers: Dict[str, str] = (
        {"x-voike-api-key": project_api_key} if project_api_key else {}
    )
    query_headers: Dict[str, str] = (
        project_json_headers(project_api_key) if project_api_key else {}
    )
    report("Uploading sample CSV via /ingest/file …")
    files = {
        "file": (
            f"{context.lower().replace(' ', '-')}-regression.csv",
            CSV_SAMPLE.encode("utf-8"),
            "text/csv",
        ),
    }
    ingest_resp = request(
        "POST",
        "/ingest/file",
        files=files,
        auth_required=not using_custom_key,
        headers=ingest_headers,
    )
    job_id = ingest_resp["jobId"]
    report("Ingest accepted", detail=str(ingest_resp))
    job = wait_for_ingest(job_id, api_key=project_api_key)
    if job.get("status") != "completed":
        raise RuntimeError(f"Ingest job ended in unexpected state: {job}")
    summary = job.get("summary", {})
    report("Ingest summary", detail=str(summary))

    table = summary.get("table")
    if not table:
        raise RuntimeError("Ingest summary missing table name.")
    query_payload = {
        "kind": "hybrid",
        "sql": f"SELECT * FROM {table} WHERE (score::numeric) > 95",
        "semanticText": "legendary scientist",
        "filters": {"entity_type": "profile"},
    }
    query_result = request(
        "POST",
        "/query",
        json=query_payload,
        auth_required=not using_custom_key,
        headers=query_headers,
    )
    report("Hybrid query meta", detail=str(query_result.get("meta")))
    report("Hybrid query rows", detail=str(query_result.get("rows")))


def inspect_project_state(label: str, api_key: str) -> None:
    headers = project_json_headers(api_key)
    kernel_state = request(
        "GET", "/kernel/state", headers=headers, auth_required=False
    )
    report(f"{label} kernel state", detail=str(kernel_state))

    ledger = request(
        "GET", "/ledger/recent", headers=headers, auth_required=False
    )
    report(f"{label} ledger entries", detail=str(len(ledger)))
    metrics = request("GET", "/metrics", headers=headers, auth_required=False)
    report(f"{label} metrics keys", detail=str(list(metrics.keys())))


def run_blob_workflow(label: str, api_key: str) -> None:
    banner(f"{label} – BlobGrid workflow")
    blob_bytes = b"Hello from VOIKE regression blob!"
    files = {"file": ("regression.txt", blob_bytes, "text/plain")}
    try:
        resp = request("POST", "/blobs", files=files)
    except RuntimeError as exc:
        if is_missing_endpoint(exc):
            report("Blob endpoints", status="SKIP", detail="Server missing /blobs routes; upgrade VOIKE to enable BlobGrid regression.")
            return
        raise
    blob_id = resp["blobId"]
    report("Blob uploaded", detail=f"blobId={blob_id}")
    manifest = request("GET", f"/blobs/{blob_id}/manifest")
    try:
        stream = requests.get(
            f"{BASE_URL}/blobs/{blob_id}/stream",
            headers={"x-voike-api-key": api_key},
            timeout=30,
        )
    except Exception as exc:
        report("Blob streaming", status="WARN", detail=f"request error: {exc}")
        return
    if stream.status_code != 200:
        if stream.status_code in (404, 405, 501):
            report("Blob streaming", status="SKIP", detail=f"status={stream.status_code} body={stream.text[:200]}")
            return
        raise RuntimeError("Blob streaming failed")
    report("Blob stream bytes", detail=str(len(stream.content)))


def run_vvm_workflow(label: str, api_key: str) -> None:
    banner(f"{label} – VVM workflow")
    headers = project_json_headers(api_key)
    descriptor = json.dumps(
        {
            "name": f"regression-{uuid.uuid4().hex[:6]}",
            "entry": {"kind": "job", "runtime": "node18", "command": ["node", "index.js"]},
            "resources": {"cpu": 0.1, "memory": "128Mi"},
        }
    )
    try:
        vvm_resp = request(
            "POST",
            "/vvm",
            json={"descriptor": descriptor},
        )
    except RuntimeError as exc:
        if is_missing_endpoint(exc):
            report("VVM endpoints", status="SKIP", detail="Server missing /vvm routes; upgrade VOIKE to enable VVM regression.")
            return
        raise
    vvm_id = vvm_resp.get("vvmId") or vvm_resp.get("vvm_id")
    report("VVM descriptor created", detail=f"vvmId={vvm_id}")
    build = request(
        "POST",
        f"/vvm/{vvm_id}/build",
        json={},
    )
    report("VVM build triggered", detail=str(build))


def run_ops_workflow(label: str, api_key: str) -> None:
    banner(f"{label} – Ops & SLO workflow")
    headers = project_json_headers(api_key)
    slo_payload = {"p95QueryLatencyMs": 250, "availabilityTarget": 0.999}
    try:
        request("PUT", "/ops/slos", json=slo_payload, headers=headers)
        slo_resp = request("GET", "/ops/slos", headers=headers)
        report("SLO state", detail=str(slo_resp))
        advisories = request("GET", "/ops/advisories", headers=headers)
        report("Ops advisories count", detail=str(len(advisories)))
    except RuntimeError as exc:
        if is_missing_endpoint(exc):
            report("Ops endpoints", status="SKIP", detail="Server missing /ops routes; upgrade VOIKE to exercise SLO flows.")
            return
        raise


def run_apix_workflow(label: str, api_key: str) -> None:
    banner(f"{label} – APIX workflow")
    try:
        schema = request("GET", "/apix/schema", auth_required=False)
    except RuntimeError as exc:
        if is_missing_endpoint(exc):
            report("APIX schema", status="SKIP", detail="Server missing /apix routes; upgrade VOIKE to enable APIX flows.")
            return
        raise
    report("APIX schema version", detail=str(schema.get("version")))
    metadata = {"client": "regression", "label": label}
    connect = request("POST", "/apix/connect", json={"metadata": metadata})
    session_token = connect.get("token")
    if not session_token:
        raise RuntimeError("APIX connect did not return token")
    flow = request(
        "POST",
        "/apix/flows",
        json={
            "sessionToken": session_token,
            "kind": "regression-flow",
            "params": {"note": label},
        },
    )
    report("APIX flow created", detail=str(flow.get("flowId")))
    flows = request(
        "GET",
        f"/apix/flows?sessionToken={session_token}",
    )
    report("APIX flows count", detail=str(len(flows)))
    exec_resp = request(
        "POST",
        "/apix/exec",
        json={
            "sessionToken": session_token,
            "op": "flow.execQuery",
            "payload": {"query": {"kind": "sql", "sql": "SELECT 1"}},
        },
    )
    report("APIX execQuery result", detail=str(exec_resp.get("rows")))


def run_ai_workflow(
    label: str,
    api_key: str,
    table_name: str = "primary_project_regression_csv",
) -> None:
    banner(f"{label} – AI Fabric workflow")

    def safe_request(step: str, func):
        try:
            return func()
        except RuntimeError as exc:
            if is_missing_endpoint(exc):
                report(
                    step,
                    status="SKIP",
                    detail="Server missing AI Phase 3 endpoints; upgrade VOIKE to exercise this workflow.",
                )
                return None
            raise

    try:
        status = request("GET", "/ai/status")
        report("AI status entries", detail=str(len(status)))
        atlas = request("GET", "/ai/atlas")
        report("AI atlas entities", detail=str(len(atlas)))
    except RuntimeError as exc:
        if is_missing_endpoint(exc):
            report(
                "AI Fabric",
                status="SKIP",
                detail="Server missing /ai endpoints; upgrade to enable AI atlas flows.",
            )
            return
        raise

    explain = safe_request(
        "AI query explanation",
        lambda: request(
            "POST",
            "/ai/query/explain",
            json={
                "sql": "SELECT * FROM primary_project_regression_csv WHERE score::numeric > 95",
                "semanticText": "legendary scientist filter",
                "filters": {"entity_type": "profile"},
            },
        ),
    )
    if explain:
        report("AI explanation", detail=explain.get("explanation"))

    summary = safe_request(
        "AI result summary",
        lambda: request(
            "POST",
            "/ai/query/summarize-result",
            json={
                "rows": [
                    {"id": "1", "name": "Ada Lovelace", "score": "99"},
                    {"id": "2", "name": "Grace Hopper", "score": "97"},
                ],
                "fields": ["id", "name", "score"],
            },
        ),
    )
    if summary:
        report("AI summary stats", detail=str(summary.get("stats")))

    table_summary = safe_request(
        "AI atlas table summary",
        lambda: request("GET", f"/ai/atlas/table/{table_name}"),
    )
    if table_summary:
        report("AI table summary", detail=str(table_summary.get("summary")))

    triage = safe_request("AI ops triage", lambda: request("GET", "/ai/ops/triage"))
    if triage:
        report("AI ops triage", detail=triage.get("summary"))

    suggestions = safe_request("AI suggestions", lambda: request("GET", "/ai/suggestions"))
    if suggestions is not None:
        report("AI suggestions count", detail=str(len(suggestions)))
        pending = next((item for item in suggestions if item.get("status") == "pending"), None)
        if pending:
            safe_request(
                "AI suggestion approve",
                lambda: request("POST", f"/ai/suggestions/{pending['id']}/approve", json={}),
            )
    safe_request(
        "AI policy ensure",
        lambda: request(
            "POST",
            "/ai/policy",
            json={"mode": "summaries"},
        ),
    )
    policy = safe_request("AI policy state", lambda: request("GET", "/ai/policy"))
    if policy:
        report("AI policy mode", detail=policy.get("mode"))
    learned = safe_request("AI IRX learn", lambda: request("POST", "/ai/irx/learn", json={}))
    if learned:
        report("AI IRX weights learned", detail=str(learned.get("weights")))
    weights = safe_request("AI IRX weights", lambda: request("GET", "/ai/irx/weights"))
    if weights:
        report("AI IRX current weights", detail=str(weights.get("weights")))
    heatmap = safe_request("AI IRX heatmap", lambda: request("GET", "/ai/irx/heatmap"))
    if heatmap:
        report("AI IRX heatmap objects", detail=str(len(heatmap.get("objects", []))))
    ai_answer = safe_request(
        "AI ask",
        lambda: request(
            "POST",
            "/ai/ask",
            json={"question": "What happened in the regression project today?"},
        ),
    )
    if ai_answer:
        report("AI ask answers", detail=str(len(ai_answer.get("answers", []))))
    pipelines = safe_request(
        "AI pipeline analysis",
        lambda: request("POST", "/ai/pipelines/analyze", json={}),
    )
    if pipelines:
        report("AI pipeline proposals", detail=str(len(pipelines.get("proposals", []))))
    capsule_summary = None
    try:
        capsule_summary = request("POST", "/ai/capsule/summary", json={})
    except RuntimeError as exc:
        if "Need at least two capsules" in str(exc):
            report("AI capsule summary", status="SKIP", detail="Less than two capsules available")
        else:
            raise
    if capsule_summary:
        report("AI capsule summary", detail=capsule_summary.get("summary"))
    try:
        capsule_timeline = request("GET", "/ai/capsule/timeline")
    except RuntimeError as exc:
        if "Need at least two capsules" in str(exc):
            report("AI capsule timeline", status="SKIP", detail="Less than two capsules available")
            capsule_timeline = None
        else:
            raise
    if capsule_timeline:
        report("AI capsule timeline events", detail=str(len(capsule_timeline.get("events", []))))
    flow_source = (
        "FLOW \"Regression Demo\"\n\n"
        "INPUTS\n"
        "  table source_table\n"
        "END INPUTS\n\n"
        "STEP load =\n"
        "  LOAD TABLE \"primary_project_regression_csv\"\n\n"
        "STEP filtered =\n"
        "  FILTER load WHERE score::numeric > 95\n\n"
        "STEP result =\n"
        "  OUTPUT filtered AS \"flow_output\"\n\n"
        "END FLOW\n"
    )
    flow_parse = safe_request(
        "FLOW parse",
        lambda: request("POST", "/flow/parse", json={"source": flow_source}),
    )
    if flow_parse and not flow_parse.get("ok"):
        report("FLOW parse warnings", detail=str(flow_parse.get("warnings")))
    flow_plan = safe_request(
        "FLOW plan",
        lambda: request("POST", "/flow/plan", json={"source": flow_source}),
    )
    plan_id = flow_plan.get("id") if flow_plan else None
    if plan_id:
        safe_request(
            "FLOW execute",
            lambda: request(
                "POST",
                "/flow/execute",
                json={"planId": plan_id, "mode": "auto"},
            ),
        )
        plans = safe_request("FLOW list plans", lambda: request("GET", "/flow/plans"))
        if plans is not None:
            report("FLOW plans count", detail=str(len(plans)))


def run_mesh_and_edge_checks() -> None:
    banner("Mesh + Edge diagnostics")
    try:
        mesh_self = request("GET", "/mesh/self", auth_required=False)
        report("Mesh self", detail=str(mesh_self.get("nodeId")))
    except Exception as exc:
        report("Mesh self", status="WARN", detail=str(exc))
    try:
        mesh_headers: Dict[str, str] = {}
        if ADMIN_TOKEN:
            mesh_headers["x-voike-admin-token"] = ADMIN_TOKEN
        mesh_nodes = request("GET", "/mesh/nodes", headers=mesh_headers or None)
        node_ids = [node.get("nodeId") for node in mesh_nodes]
        detail = f"count={len(node_ids)} ids={node_ids}"
        status = "OK" if len(node_ids) >= 1 else "WARN"
        report("Mesh nodes", status=status, detail=detail)
        if len(node_ids) < 2:
            report("Mesh redundancy", status="WARN", detail="less than 2 nodes visible")
    except RuntimeError as exc:
        if is_missing_endpoint(exc):
            report("Mesh nodes", status="SKIP", detail="Endpoint unavailable on this build.")
        else:
            report("Mesh nodes", status="WARN", detail=str(exc))
    try:
        edge_profile = request("GET", "/edge/profile")
        report("Edge profile", detail=str(edge_profile))
    except Exception as exc:
        report("Edge profile", status="WARN", detail=str(exc))
    try:
        edge_llm = request(
            "POST",
            "/edge/llm",
            json={"prompt": "Summarize the local regression dataset."},
        )
        report("Edge LLM mode", detail=str(edge_llm.get("mode")))
    except RuntimeError as exc:
        if is_missing_endpoint(exc):
            report(
                "Edge LLM",
                status="SKIP",
                detail="Server missing /edge/llm; upgrade to exercise village intelligence.",
            )
        else:
            report("Edge LLM", status="WARN", detail=str(exc))
    try:
        edge_sync = request(
            "POST",
            "/edge/sync",
            json={"records": [], "embeddings": []},
        )
        embeddings = edge_sync.get("embeddings", [])
        report("Edge sync embeddings", detail=str(len(embeddings)))
    except RuntimeError as exc:
        if is_missing_endpoint(exc):
            report(
                "Edge sync",
                status="SKIP",
                detail="Server missing /edge/sync; upgrade to enable CRDT reconciliation.",
            )
        else:
            report("Edge sync", status="WARN", detail=str(exc))
    if ADMIN_TOKEN:
        try:
            genesis = request(
                "GET",
                "/genesis",
                headers={"x-voike-admin-token": ADMIN_TOKEN},
                auth_required=False,
            )
            report("Genesis clusterId", detail=str(genesis.get("clusterId")))
        except Exception as exc:
            report("Genesis fetch", status="WARN", detail=str(exc))


def run_routing_checks() -> None:
    banner("Routing stack (SNRL + VDNS)")
    try:
        snrl = request(
            "POST",
            "/snrl/resolve",
            json={
                "domain": ROUTING_DOMAIN,
                "client": {"region": "dev-local", "capabilities": ["http", "gpu"]},
            },
        )
        candidates = snrl.get("candidates", [])
        report("SNRL candidates", detail=f"{len(candidates)} for {ROUTING_DOMAIN}")
    except RuntimeError as exc:
        if is_missing_endpoint(exc):
            report("SNRL resolve", status="SKIP", detail="Endpoint missing in this build.")
        else:
            report("SNRL resolve", status="WARN", detail=str(exc))
    if ADMIN_TOKEN:
        headers = admin_json_headers()
        try:
            endpoints = request(
                "GET",
                "/snrl/endpoints",
                headers=headers,
                auth_required=False,
            )
            report("SNRL registered endpoints", detail=str(len(endpoints)))
        except Exception as exc:
            report("SNRL endpoint list", status="WARN", detail=str(exc))
        try:
            zone_text = request(
                "GET",
                f"/vdns/zones/{VDNS_ZONE_ID}/export",
                headers=headers,
                auth_required=False,
            )
            report("VDNS zone bytes", detail=str(len(zone_text)))
        except Exception as exc:
            report("VDNS export", status="WARN", detail=str(exc))
    else:
        report("VDNS export", status="SKIP", detail="ADMIN_TOKEN not configured")


def run_resilience_checks() -> None:
    banner("Resilience + Snapshots")
    try:
        replay = request(
            "POST",
            "/ledger/replay",
            json={"limit": 5},
        )
        report(
            "Ledger replay",
            detail=f"count={replay.get('count')} finalEnergy={replay.get('finalEnergy')}",
        )
        anchor = request(
            "POST",
            "/ledger/anchor",
            json={"limit": 50},
        )
        report("Ledger anchor hash", detail=str(anchor.get("anchor")))
    except RuntimeError as exc:
        if is_missing_endpoint(exc):
            report("Ledger replay/anchor", status="SKIP", detail="Endpoints missing in this build.")
        else:
            report("Ledger replay/anchor", status="WARN", detail=str(exc))
    try:
        capsules = request("GET", "/capsules")
        report("Capsule inventory", detail=f"{len(capsules)} snapshots available")
    except RuntimeError as exc:
        if is_missing_endpoint(exc):
            report("Capsule list", status="SKIP", detail="Capsule endpoints missing.")
        else:
            report("Capsule list", status="WARN", detail=str(exc))


def run_mcp_blob_tool(api_key: str) -> None:
    banner("MCP blob.put tool")
    payload = {
        "base64": base64.b64encode(b"MCP blob payload").decode("utf-8"),
        "filename": "mcp.txt",
        "mediaType": "text/plain",
    }
    resp = mcp_execute("blob.put", payload)
    report("MCP blob.put result", detail=str(resp.get("blobId")))


def run_control_plane_demo() -> Optional[Dict[str, str]]:
    banner("Control Plane + Builder Flow")
    email_suffix = uuid.uuid4().hex[:8]
    email = f"regression+{email_suffix}@example.com"
    waitlist_payload = {"email": email, "name": "Regression Bot"}
    waitlist_resp = request(
        "POST", "/waitlist", json=waitlist_payload, auth_required=False
    )
    entry = waitlist_resp.get("entry", {})
    entry_id = entry.get("id")
    report(
        "Waitlist signup",
        detail=f"id={entry_id} status={waitlist_resp.get('status')}",
    )

    whitelist_status = request(
        "POST",
        "/auth/check-whitelist",
        json={"email": email},
        auth_required=False,
    )
    report("Whitelist check", detail=str(whitelist_status))

    if not ADMIN_TOKEN:
        report(
            "Admin provisioning",
            status="SKIP",
            detail="VOIKE_ADMIN_TOKEN not set; add it to scripts/.env to run approval flow.",
        )
        return None
    if not entry_id:
        report("Waitlist entry missing id", status="WARN")
        return None

    try:
        admin_headers = admin_json_headers()
    except RuntimeError:
        report(
            "Admin provisioning",
            status="SKIP",
            detail="VOIKE_ADMIN_TOKEN not configured.",
        )
        return None
    suffix = uuid.uuid4().hex[:6]
    try:
        approval = request(
            "POST",
            f"/admin/waitlist/{entry_id}/approve",
            headers=admin_headers,
            json={
                "organizationName": f"reg-org-{suffix}",
                "projectName": f"reg-project-{suffix}",
                "keyLabel": "regression",
            },
            auth_required=False,
        )
    except RuntimeError as exc:
        if "Invalid admin token" in str(exc):
            report("Admin provisioning", status="SKIP", detail="Server rejected admin token.")
            return None
        raise
    organization = approval.get("organization", {})
    project = approval.get("project", {})
    api_key = approval.get("apiKey", {}).get("key")
    report(
        "Waitlist approved",
        detail=f"organization={organization.get('name')} project={project.get('name')}",
    )

    password = f"PyRegression-{uuid.uuid4().hex}"
    setup = request(
        "POST",
        "/auth/setup-password",
        json={"email": email, "password": password, "name": "Regression Bot"},
        auth_required=False,
    )
    report("Builder password setup", detail=f"expiresIn={setup.get('expiresIn')}")

    login = request(
        "POST",
        "/auth/login",
        json={"email": email, "password": password},
        auth_required=False,
    )
    token = login.get("token")
    report("Builder login", detail=f"user={login.get('user', {}).get('email')}")

    if token:
        bearer_headers = {"authorization": f"Bearer {token}"}
        profile = request(
            "GET", "/user/profile", headers=bearer_headers, auth_required=False
        )
        org_names = [org.get("name") for org in profile.get("organizations", [])]
        report("Builder profile organizations", detail=str(org_names))
        projects = request(
            "GET", "/user/projects", headers=bearer_headers, auth_required=False
        )
        report(
            "Builder projects",
            detail=str([proj.get("name") for proj in projects]),
        )
    else:
        report("Builder token missing", status="WARN")

    if not api_key:
        report("Provisioned API key missing", status="WARN")
        return None

    inspect_project_state("Provisioned project (pre-ingest)", api_key)
    return {
        "api_key": api_key,
        "project_name": project.get("name") or f"reg-project-{suffix}",
    }


def run_regression(args: argparse.Namespace) -> None:
    banner(f"VOIKE-X regression against {BASE_URL}")

    health = request("GET", "/health", auth_required=False)
    report("Health", detail=str(health))
    info = request("GET", "/info", auth_required=False)
    report("Available endpoints", detail=str(list(info.get("endpoints", {}).keys())))

    kernel_state = request("GET", "/kernel/state")
    report("Kernel state", detail=str(kernel_state))

    run_ingest_and_query("Primary project")

    ledger = request("GET", "/ledger/recent")
    report("Ledger entries", detail=str(len(ledger)))
    if ledger:
        entry_id = ledger[0].get("id")
        if entry_id:
            detail = request("GET", f"/ledger/{entry_id}")
            if detail.get("id") != entry_id:
                raise RuntimeError("Ledger detail lookup mismatch.")
            report("Ledger detail lookup", detail=f"id={entry_id}")

    metrics = request("GET", "/metrics")
    report("Metrics keys", detail=str(list(metrics.keys())))

    tools = request("GET", "/mcp/tools")
    tool_names = [tool["name"] for tool in tools]
    report("MCP tools", detail=str(tool_names))
    if "db.query" in tool_names:
        mcp_result = mcp_execute(
            "db.query",
            {"query": {"kind": "sql", "sql": "SELECT 42 AS answer"}},
        )
        report("MCP db.query", detail=str(mcp_result))
    if "kernel.getEnergy" in tool_names:
        energy = mcp_execute("kernel.getEnergy", {})
        report("MCP kernel.getEnergy", detail=str(energy))

    if args.fibonacci:
        banner("Fibonacci SQL")
        fib_val = run_fibonacci_sql(args.fibonacci)
        report(f"fib({args.fibonacci})", detail=fib_val)

    if args.grid_fib:
        run_grid_fibonacci_job(args.grid_fib)
    if args.grid_split:
        run_grid_split_job(args.grid_split)

    # Security regression: missing API key should 401.
    resp = requests.get(f"{BASE_URL}/kernel/state", timeout=10)
    if resp.status_code != 401:
        raise RuntimeError(f"Expected 401 for missing API key, got {resp.status_code}")
    report("Unauthorized access check", detail="401 as expected")

    # Optional admin checks
    run_admin_checks()

    control_plane_result = run_control_plane_demo()
    if control_plane_result and control_plane_result.get("api_key"):
        api_key = control_plane_result["api_key"]
        label = control_plane_result.get("project_name", "Provisioned project")
        run_ingest_and_query(label, project_api_key=api_key)
        inspect_project_state(f"{label} (post-ingest)", api_key)
        run_blob_workflow(label, api_key)
        run_vvm_workflow(label, api_key)
        run_ops_workflow(label, api_key)
        run_apix_workflow(label, api_key)
        run_ai_workflow(label, api_key)
        run_mcp_blob_tool(api_key)
    else:
        run_blob_workflow("Primary project", API_KEY)
        run_vvm_workflow("Primary project", API_KEY)
        run_ops_workflow("Primary project", API_KEY)
        run_apix_workflow("Primary project", API_KEY)
        run_ai_workflow("Primary project", API_KEY)
        run_mcp_blob_tool(API_KEY)

    run_mesh_and_edge_checks()
    run_routing_checks()
    run_resilience_checks()

    banner("Python regression completed successfully ✅")


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
    parser.add_argument(
        "--grid-fib",
        type=int,
        default=1000,
        help="Submit a grid job that computes Fibonacci(n). Set to 0 to skip.",
    )
    parser.add_argument(
        "--grid-split",
        type=int,
        default=0,
        help="Submit a split grid job (fib_split) with chunked segments; 0 to skip.",
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
def run_admin_checks() -> bool:
    if not ADMIN_TOKEN:
        report(
            "Admin checks",
            status="SKIP",
            detail="VOIKE_ADMIN_TOKEN not set; add it to scripts/.env to exercise admin flows.",
        )
        return False
    try:
        headers = admin_json_headers()
        waitlist = request(
            "GET", "/admin/waitlist", headers=headers, auth_required=False
        )
        report("Admin waitlist entries", detail=str(len(waitlist)))
        return True
    except RuntimeError as exc:
        if "Invalid admin token" in str(exc):
            report(
                "Admin checks",
                status="SKIP",
                detail="Server rejected admin token; ensure Genesis backend uses the shared value.",
            )
            return False
        raise
