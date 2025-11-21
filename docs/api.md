# VOIKE-X API Brief

Everything in VOIKE is exposed through HTTP + WebSocket endpoints so frontend playgrounds, SDKs, or MCP agents can call the same contracts. This guide mirrors `README.md` and already documents VOIKE V2.0 subsystems so client teams are unblocked even while modules roll out.

## 0. Discovery Surface
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/` | none | Tailwind landing page – reuse inside your docs/playground |
| `GET` | `/info` | none | JSON mirror of `/` (quickstart steps, curl samples, exposed playground key) |
| `GET` | `/health` | none | `{ status, db, kernel }` probe for uptime checks |
| `GET` | `/genesis` | admin | Returns the active Genesis doc (clusterId, bootstrap, replication) |

Setting `PLAYGROUND_API_KEY` creates a demo project and surfaces that key on `/` + `/info` for public sandboxes.

## 1. Authentication Model
- `X-VOIKE-API-Key` – required on ingestion, query, kernel, BlobGrid, capsules, metrics, MCP, and WebSocket calls.
- `X-VOIKE-ADMIN-TOKEN` – required on provisioning endpoints (`/waitlist` approvals, organizations, projects, API keys). There is **no** admin username/password flow.
- `Authorization: Bearer <token>` – builder-only endpoints (`/auth/*`, `/user/*`) use JWTs once a waitlist entry is approved.

If env vars are missing in non-prod setups, VOIKE falls back to the defaults in `.env.example` so Docker demos still work.

### Waitlist + Admin APIs
| Method | Path | Description |
| --- | --- | --- |
| `POST /waitlist` | Public signup (`{ email, name? }`). Returns `{ status, entry }`. |
| `GET /admin/waitlist` | List entries (pending + approved). Requires admin token. |
| `POST /admin/waitlist/{id}/approve` | Provision org → project → API key for the entry. |
| `GET /admin/organizations` / `POST /admin/organizations` | Enumerate or create orgs. |
| `POST /admin/projects` | Create project + API key (auto-creates org when needed). |
| `POST /admin/organizations/{orgId}/projects` | Add project/key inside existing org. |
| `POST /admin/projects/{projectId}/api-keys` | Mint additional API keys. |

Approving a waitlist entry marks the `users` row as `approved` but **does not** set a password. Builders finalize onboarding through the next section.

### Builder Self-Service (JWT)
| Method | Path | Payload | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/check-whitelist` | `{ email }` | Returns status + whether password exists. |
| `POST` | `/auth/setup-password` | `{ email, password, name? }` | One-time password creation for approved entries. |
| `POST` | `/auth/login` | `{ email, password }` | Issues JWT (`expiresIn = JWT_TTL_SECONDS`). |
| `GET` | `/user/profile` | – | User info + owned orgs/projects (requires bearer token). |
| `GET` | `/user/organizations` | – | All organizations owned by the builder. |
| `GET` | `/user/projects` | – | Builder-owned projects. |
| `POST` | `/user/projects` | `{ projectName, organizationId? | organizationName?, keyLabel? }` | Create project + key without admin token. |
| `POST` | `/user/projects/{id}/api-keys` | `{ label? }` | Additional builder-scoped keys. |

## 2. Project APIs (require `X-VOIKE-API-Key`)

### 2.1 Ingestion
- `POST /ingest/file` (multipart)  
  Fields: `file`, optional `logicalName`. Response `{ jobId, table }`.
- `GET /ingest/{jobId}` → Poll job summary/status.
- `GET /ingestion/jobs?limit=` – list recent jobs + summaries.
- `GET /ingestion/jobs/{id}` – identical to `/ingest/{id}` but under the Module 7 namespace.
- `GET /ingestion/lineage?limit=` – lineage records (schema preview, transformation plan, embedding metadata) for the project.
- `POST /ingestion/schema/infer` – body `{ rows: [ {…} ], logicalName? }` → schema inference preview.
- `POST /ingestion/transform/plan` – body `{ sample: [...], hints? }` → suggested transformation steps (`flatten_nested`, `drop_nulls`, `arrays_to_json`, …).

### 2.2 Query & Hybrid Reasoning
`POST /query`
```json
{
  "kind": "hybrid",
  "sql": "SELECT * FROM scientists WHERE score > 90",
  "semanticText": "notable scientists",
  "filters": { "entity_type": "profile" }
}
```
Response includes rows plus `meta.engine`, `meta.latencyMs`, `meta.correctedQuery`, and `meta.kernelTraceId`. Kernel-8 corrects and plans, Kernel-9 participates when routed via `route_hint`.

### 2.3 Kernel + Ledger
- `GET /kernel/state` – `{ energy, dai, limits }` snapshot.
- `GET /ledger/recent` – 20 most recent Truth Ledger entries scoped to the key.
- `GET /ledger/{id}` – Fetch a single ledger entry (must belong to same project).
- `POST /ledger/replay` – `{ since?, until?, limit?, entryIds? }` → ordered entries + `finalEnergy`; perfect for rollbacks and audits (see `scripts/ledger_replay.py` / `docs/resilience_playbooks.md`).
- `POST /ledger/anchor` – same shape as replay request, returns `{ anchor, entryCount, firstTimestamp, lastTimestamp }` so you can notarize ledger segments.

### 2.4 MCP Tools
- `GET /mcp/tools` – metadata for registered tools.
- `POST /mcp/execute`
```json
{
  "name": "db.query",
  "input": { "query": { "kind": "sql", "sql": "SELECT 1" } },
  "context": { "sessionId": "cli-demo" }
}
```
The backend injects `projectId` automatically so logging/ledger entries remain scoped.

### 2.5 Metrics + Streaming
- `GET /metrics` – Prom-style JSON gauges (latency, counters, kernel energy, ingest counts).
- `GET /events` (WebSocket) – Send `X-VOIKE-API-Key` header. Streams:
  - `ingest.completed`
  - `query.executed`
  - `kernel.energyUpdated`
  - `dai.updateSuggested`
  - Custom serverless events

### 2.6 BlobGrid
- `POST /blobs` – upload blob, choose replication or erasure coding, receive manifest (chunk CIDs + schema).
- `GET /blobs/{blobId}/manifest` – chunk metadata, coding info, locality hints.
- `GET /blobs/{blobId}/stream` – server stitches chunks from the grid (online-first) but honors cached/offline chunks if present; once WAN reconnects, latest manifest wins to avoid stale caches.

### 2.7 Edge / Village APIs
- `POST /edge/sync` – exchange CRDT deltas between edge node and backbone. v6 adds edge embedding sync so each node maintains `edge_embeddings` (tables + blobs summarized offline). Response includes merged CRDT records plus the node’s local embedding view.
- `GET /edge/cache` – inspect what objects are pinned locally (blobs, rows, embeddings).
- `GET /edge/profile` – returns node persona metadata (role, roles[], region, bandwidthClass) so dashboards/agents can adapt.
- `POST /edge/llm` – consults the local embedding cache first (offline mode) and returns the snippets it used. If nothing matches, it automatically schedules a mesh/grid inference and returns that completion while noting the empty local context.

### 2.8 IRX Policy Surface
- `GET /irx/objects?type=blob&projectId=...` – inspect IRX scores and placement suggestions.
- `POST /irx/hints` – optional hints (`{ objectId, utility, localityBoost }`) to nudge IRX scoring (validated + logged).

### 2.9 Grid Compute
- `POST /grid/jobs` – submit jobs (`llm.infer`, `media.transcode`, `query.analytics`, custom). VOIKE schedules them across nodes maximizing IRX = (Utility × Locality × Resilience) / (Cost × Energy). Include `preferLocalEdge` or `preferVillage` flags to bias toward edge/village nodes.
- `GET /grid/jobs/{jobId}` – status, logs, result references.

Example Fibonacci jobs (used by `scripts/grid.py` & `flows/voike-grid.flow`):
```json
POST /grid/jobs
{ "type": "custom", "params": { "task": "fib", "n": 2000 } }

POST /grid/jobs
{ "type": "custom", "params": { "task": "fib_split", "n": 10000, "chunkSize": 500 } }
```
The second payload spawns child jobs for each chunk, allowing different nodes to compute partial matrices; the parent job stitches results and returns `result.fib` plus a `segments` array of child job IDs so you can audit which node processed each slice.

### 2.10 Capsules
- `GET /capsules` – List recent capsule metadata for the current project (used by offline sync + resilience playbooks).
- `POST /capsules` – Create capsule with `{ manifest, description?, labels? }`.
- `GET /capsules/{capsuleId}` – Fetch manifest/details.
- `POST /capsules/{capsuleId}/restore` – Trigger restore workflow (returns queued job payload).

### 2.11 Playground APIs
- `POST /playground/sessions` – bootstrap a dev sandbox tied to your project.
- `POST /playground/snippets` – save code cells that mix `/query`, `/ingest`, `/blobs`, `/grid/jobs`.
- `POST /playground/datasets` – upload sample datasets for experiments.

### 2.11 Capsules (“Time Machine”)
- `POST /capsules` – snapshot schema, data, blobs, models, code refs into an immutable capsule ID.
- `GET /capsules/{capsuleId}` – inspect manifest.
- `POST /capsules/{capsuleId}/restore` – rebuild the environment (tables, BlobGrid references, metadata). Capsules are content-addressed and treated as high-IRX objects for eons-grade preservation.

- `POST /internal/rpc` – reserved for mesh-to-mesh calls (currently returns 501 until bespoke RPC handlers are registered).

### 2.12 Mesh Diagnostics
- `GET /mesh/self` – identify the current node (`nodeId`, roles, addresses, status).
- `GET /mesh/nodes` (admin) – list every known node from the mesh heartbeat table.
- `GET /genesis` (admin) – inspect the Genesis book the node booted with.
- `POST /internal/rpc` – reserved for mesh RPC (currently returns 501 until handlers are registered).

### 2.13 Ops & SLOs
- `GET /ops/slos` – fetch the current project SLO definition.
- `PUT /ops/slos` – update SLO targets (latency, availability, durability, blob repair window, notes).
- `GET /ops/advisories` – list open advisories generated by the Ops Autopilot.

### 2.14 VVM (Voike Virtual Machine)
- `POST /vvm` – register a VVM descriptor by sending `{ "descriptor": "<yaml string>" }`.
- `GET /vvm` – list descriptors for the current project.
- `POST /vvm/{vvmId}/build` – trigger a VVM build (grid job `vvm.build`), returning `{ artifactId, jobId }`.

### 2.15 APIX Sessions & Flows
- `GET /apix/schema` – discover the APIX schema (ops + intents + types) for code generation.
- `POST /apix/connect` – create a project-scoped APIX session; returns `{ sessionId, token }`.
- `POST /apix/flows` – open a flow within a session (`{ sessionToken, kind, params }`).
- `GET /apix/flows?sessionToken=<uuid>` – list flows tied to a session token.
- `POST /apix/exec` – execute an APIX op inside a session (`flow.execQuery`, `flow.ingestBatch`, `flow.execVvm` in v1). Body: `{ sessionToken, op, payload }`.

`/apix/schema` also advertises virtual ops for VOIKE FLOW itself: `flow.parse`, `flow.plan`, and `flow.execute`. Agents can validate, compile, and run FLOW purely through APIX (no extra HTTP round-trips) inside a trusted session token.

### 2.16 Infinity Fabric
- `GET /infinity/nodes` (builder JWT) – inspect mesh nodes annotated with provider/region/cost/carbon metadata.
- `GET /infinity/pools` (project API key) – list pools available to the current project (global + project-scoped).
- `POST /infinity/pools` (project API key) – create/update pools with selectors/policies:
  ```json
  {
    "name": "latency-apac",
    "selector": { "region": "ap-southeast-1" },
    "policies": { "optimize_for": "latency", "max_cost_per_hour": 2.5 }
  }
  ```

### 2.17 AI Fabric
- `GET /ai/status` – recent AI jobs (ingest analysis, atlas updates) for this project.
- `GET /ai/atlas` – list of discovered entities/topics for the project’s Knowledge Atlas (tables, blobs, semantic groupings). Returns empty array if AI Fabric isn’t enabled yet.
- `GET /ai/atlas/table/:table` – summary for a specific table/entity captured by the atlas.
- `GET /ai/policy` / `POST /ai/policy` – fetch or update the Knowledge Fabric data policy (`none`, `metadata`, `summaries`, `full`). Default is `summaries` so builders get helpful output without exposing raw payloads.
- `POST /ai/ask` – project-scoped Q&A endpoint that pulls from the Knowledge Fabric (ingests, queries, blobs, jobs, ledger events) obeying the current policy.
- `POST /ai/query/explain` – returns a human-readable explanation for an incoming query (`{ sql, semanticText?, filters? }`).
- `POST /ai/query/summarize-result` – send sampled rows to receive high-level stats (row count, numeric ranges, categorical leaders).
- `GET /ai/ops/triage` – AI-backed triage of the project’s SLO + advisory state.
- `GET /ai/suggestions` – curated list of AI suggestions (schema/index/HyperFlow ideas) awaiting approval.
- `POST /ai/suggestions/{id}/approve` / `POST /ai/suggestions/{id}/reject` – change the status of a suggestion (still logged in the Truth Ledger).
- `POST /ai/irx/learn` – recalc project-specific IRX weights from recent `irx_objects` observations (read-only; IRX stays deterministic).
- `GET /ai/irx/weights` – inspect the current learned weights (utility/locality/resilience/cost/energy distribution per project).
- `GET /ai/irx/heatmap` – shows the hottest objects (blobs/datasets/jobs) with tiers (`hot/warm/cold`) plus weighted scores using the learned weights.
- `POST /ai/pipelines/analyze` – scans recent `grid_jobs` for repeated patterns and returns pipeline proposals (VVM descriptors + HyperFlow DAG suggestions). Automatically emits `pipeline` suggestions that the user can approve via `/ai/suggestions`.
- `POST /ai/capsule/summary` – compare two capsules (or the latest pair) and narrate what changed: tables, blobs, models, code references.
- `GET /ai/capsule/timeline` – story view of capsule history (first snapshot → latest) with counts per snapshot so builders can see how the project evolved.

### 2.18 Chat Sessions
- `POST /chat` – send a chat message (optionally referencing `sessionId`); VOIKE records the conversation, calls the Knowledge Fabric, and returns `{ sessionId, reply, policy, answers }`.
- `GET /chat/sessions` – list the most recent chat sessions for the API key’s project.
- `GET /chat/sessions/{sessionId}/messages` – fetch the transcript/history for a given session (roles, content, actions).

### 2.19 FLOW Plans
- `POST /flow/parse` – validate FLOW text and return AST + warnings.
- Request:
  ```json
  {
    "source": "FLOW \"Name\" ... END FLOW",
    "options": { "strict": true }
  }
  ```
- Response:
  ```json
  {
    "ok": true,
    "warnings": [],
    "ast": { "...": "..." }
  }
  ```
- `POST /flow/plan` – compile FLOW into an execution plan graph (stored per project).
- Request:
  ```json
  { "source": "FLOW ... END FLOW", "projectId": "uuid-of-project" }
  ```
- Response:
  ```json
  {
    "planId": "plan-uuid",
    "graph": {
      "nodes": [{ "id": "step:load", "kind": "FLOW_OP", "op": "LOAD_CSV@1.0", "inputs": [], "outputs": ["load"] }],
      "edges": [{ "from": "step:load", "to": "step:filtered", "via": "load" }]
    }
  }
  ```
- `POST /flow/execute` – run a stored plan (sync for tiny flows, async via Grid for larger ones).
- Request:
  ```json
  {
    "planId": "plan-uuid",
    "inputs": { "sales_csv": "blob://..." },
    "mode": "auto"
  }
  ```
- Response (sync):
  ```json
  {
    "mode": "sync",
    "outputs": { "TopCustomers": [ { "customer": "C1", "total": 123 } ] },
    "metrics": { "elapsedMs": 132, "nodesExecuted": 5 }
  }
  ```
- `GET /flow/plans`, `GET /flow/plans/{planId}`, `DELETE /flow/plans/{planId}` – manage stored plans.
- `GET /flow/ops` – list supported FLOW op contracts (`LOAD_CSV@1.0`, `INFER@1.0`, etc.).
- `GET /flow/ops/{name}` – inspect an individual op (category, description, version) to teach agents or UIs.
- `GET /playground/flow-ui` – Tailwind playground UI that calls the above endpoints via fetch; use it with `VOIKE_PLAYGROUND_API_KEY` or your project key.

Runtime highlights:
- `APX_EXEC` now invokes APIX contracts (or stubs) from within a FLOW plan, so meta flows can bootstrap kernels/envs without custom glue.
- `BUILD_VPKG` and `DEPLOY_SERVICE` convert plan outputs into running services by talking to the VPKG registry + gateway hooks.
- `OUTPUT_TEXT` lets agents emit human-readable briefings even when no table result exists.

### 2.20 Packages & Apps
- `POST /vpkgs` – publish a `.vpkg` bundle (manifest + base64 payload) into the current project registry.
- `GET /vpkgs` / `GET /vpkgs/:pkgId` – list or inspect stored bundles.
- `GET /vpkgs/download?name=<pkg>&version=<semver>` – fetch a bundle for `voike get`; falls back to project-local cache if version omitted.
- `GET /vpkgs/:pkgId/download` – download a specific bundle by ID.
- `POST /vpkgs/:pkgId/launch` – launch an app backed by a previously uploaded bundle.
- `POST /vpkgs/launch` – upload + launch in a single call (used by `voike launch`).
- `GET /apps`, `GET /apps/{appId}` – inspect launched app instances (status, endpoint).

See `flow/docs/VPKG-spec.md` for bundle format details.

### 2.21 Environment Descriptors
- `POST /env/descriptors` – register an environment descriptor (`{ name, kind, baseImage?, command?, packages?, variables? }`) scoped to the project.
- `GET /env/descriptors` / `GET /env/descriptors/{envId}` – list or inspect descriptors.
- `POST /env/descriptors/{envId}/resolve` – returns the runner plan (mode, command, env vars) tuned to the node’s `VOIKE_NODE_MODE` (`docker` or `baremetal`).
- Descriptors are re-used by VVM builds/executions and surfaced via the CLI (`voike env add/list`).
- Dynamic runtime pattern: ship the SDK in a container image, register it once, then point VVM descriptors at the env. See `examples/vvm/dotnet-env.yaml` / `examples/vvm/dotnet-vvm.json` for a .NET 8 template; swap the image/command for Python, Java, npm, etc. and VOIKE automatically runs them via Docker on every node.

### 2.22 Orchestrator (VOIKE 3.0 preview)
- `POST /orchestrator/projects` – register a project (core/app/lib) so VOIKE can orchestrate its lifecycle.
- `GET /orchestrator/projects` / `GET /orchestrator/projects/{id}` – inspect registered projects.
- `POST /orchestrator/projects/{id}/graph` – upload the module/dependency/endpoint graph discovered during a repo scan; `GET /orchestrator/projects/{id}/graph` returns the stored graph.
- `POST /orchestrator/agents` / `GET /orchestrator/agents` – track agent personas (planner, codegen, tester, infra, etc).
- `POST /orchestrator/tasks` – create a workflow item (`{ projectId, kind, description, priority }`).
- `GET /orchestrator/tasks?projectId=...` / `GET /orchestrator/tasks/{id}` – monitor tasks, steps, and statuses.
- `POST /orchestrator/tasks/{taskId}/run-agent` – run an agent against a task (records a step with agent output; agents are stubs today but plug into Grid jobs later).

These endpoints back the forthcoming `voike task` / `voike evolve` CLI experience and lay the groundwork for fully agentic evolution.

### 2.23 Agent Registry (Module 2)
- `POST /agents` – register a canonical Module 2 agent for the current project. Pass `{ name, class, capabilities?, tools?, memory?, goalStack?, state?, metadata? }`. When `capabilities` or `tools` are omitted, VOIKE fills them from the class defaults (`system`, `kernel`, `network`, `database`, `file`, `security`, `developer`, `user`).
- `GET /agents` – list all agents for the project; accepts optional `projectId` (must match the caller’s project).
- `GET /agents/{agentId}` – fetch a specific agent (enforces project scoping).
- `GET /agents/classes` – return the static catalog of agent classes with descriptions, default capabilities, and tool manifests. Useful for Codex/LLMs before calling `POST /agents`.
- `GET /agents/tools` – enumerate runtime tool definitions (Module 3) so builders know which intents are available (`log.emit`, `ai.ask`, `flow.execute`, `grid.submit`, ...).
- `POST /agents/{agentId}/run` – enqueue a runtime task for the given agent. Body shape: `{ intent: "ai.ask" | "flow.execute" | ..., payload?: {...} }`. The supervisor validates capabilities, routes the task through Router/Worker lanes, executes via the Tool Execution Engine, and returns `{ taskId, status, output }`.

### 2.24 SNRL Resolve (Module 4)
- `POST /snrl/resolve` – Semantic Network Resolution Layer entrypoint. Requires `X-VOIKE-API-Key`.
- `GET /snrl/endpoints` (admin) – list configured POP endpoints.
- `POST /snrl/endpoints` (admin) – upsert or replace endpoint metadata (id, host, ip, region, capabilities).
- `DELETE /snrl/endpoints/:id` (admin) – remove a POP endpoint from the resolver set.
- `GET /snrl/predictions` (admin) – inspect predictive cache entries (domain, region, intent, confidence, top candidate + generatedAt) for dashboards or POP validation.
- `GET /snrl/insights` (admin) – aggregate top domains, regional load, cache size, failing endpoints, and the active trust anchor pulled from `config/snrl-state.json`.
- `GET /snrl/failures` (admin) – summarize failure counters + recent failure events (endpoint metadata, reason, timestamp) so you can trace the auto-penalty loop.

Request:
```json
{
  "domain": "api.voike.com",
  "client": {
    "region": "ap-sg",
    "latencyMs": 25,
    "capabilities": ["http", "gpu"]
  }
}
```

Response:
```json
{
  "domain": "api.voike.com",
  "candidates": [
    { "id": "edge-sg1", "host": "edge-sg1.voike.net", "ip": "103.1.212.10", "port": 443, "region": "ap-sg", "capabilities": ["http","gpu"], "score": 1.18 },
    { "id": "edge-us1", "host": "edge-us1.voike.net", "ip": "198.51.100.20", "port": 443, "region": "us-east", "capabilities": ["http"], "score": 0.77 }
  ],
  "signature": "a11ce6f4a...",
  "issuedAt": "2025-11-18T11:00:00.000Z",
  "ttl": 30
}
```

Notes:
- Backed by `flows/snrl-semantic.flow` which orchestrates lookup → signing via FLOW APX opcodes.
- Endpoints initially sourced from `config/snrl-endpoints.json`; update through MCP tools to reflect real POPs.
- Responses are cryptographically signed so clients can verify provenance; the trust anchor persists inside `config/snrl-state.json` so Module 4’s distributed trust stays stable across restarts.
- `services/snrl-ai-edge/` ships a FastAPI + dnslib reference implementation that consumes these endpoints locally (UDP port `1053` by default) and exposes the same predictive cache metrics via HTTP.

### 2.24 VDNS Management
- `POST /vdns/zones` (admin) – create or replace a full zone definition (zone metadata + records).
- `GET /vdns/zones` (admin) – list configured zones.
- `GET /vdns/zones/{zoneId}` / `GET /vdns/zones/{zoneId}/export` – inspect metadata or emit BIND/Knot zone files.
- `POST /vdns/records` (admin) – append a DNS record and bump the zone serial (body: `{ zoneId, record }`).

Zones are stored in `config/vdns-zones.json` by default; all changes are auditable and can also be triggered through FLOW (`flows/vdns-zone-sync.flow`). Feed the exported zone text into Knot/NSD authoritative servers for the A-Tier SNRL deployment.

### 2.25 Agent Ops
- `POST /agents/fast-answer` – run the fast multi-agent FLOW (planner → reasoning → facts → code → critique → stitch). Returns question, segments, taskId and the stitched answer; all steps are logged under `/orchestrator/tasks`.
- APIX adds ops:
  - `agent.taskSplit`, `agent.reasoning`, `agent.facts`, `agent.code`, `agent.critique`, `agent.stitcher`, `agent.fastAnswer`.
  - `source.fetchProject`, `db.introspect`, `db.migrationPlanner`, `db.migrateToVoike`, `vvm.autogenFromProject`, `vpkgs.createFromProject`, `apps.launch`, `agent.onboardExplainer` – used by `flows/onboard-foreign-app.flow` to clone/import apps.
  - `project.build` – runs the repo build pipeline (currently supports Node/JS installs + builds) and logs outputs under `/orchestrator/tasks`.
- Higher-level FLOWs:
  - `flows/fast-agentic-answer.flow` + `/agents/fast-answer` route demonstrate the planner → reasoning → facts → code → critique → stitch loop (backed by GPT when `OPENAI_*` env vars are set).
  - `flows/onboard-foreign-app.flow` drives `voike app onboard` to clone/import apps from Lovable/Replit/git + Supabase/Postgres.
  - `flows/voike-meta.flow` boots VOIKE itself (DB/kernels/VASM/envs/VVM/VPKG launch, regression/perf, capsule snapshots), and `flows/voike-self-evolve.flow` runs the planner/codegen/tester/infra/product agents to evolve VOIKE.
- These agents are GPT-backed when `OPENAI_API_KEY` is provided; otherwise they fall back to synthetic responses so FLOW plans can still execute end-to-end.

### 2.26 Hypermesh + UOR Engine (Module 5)
- `GET /hypermesh/status` (admin) – returns the latest PerfWatch/MeshSurgeon/HyperRoute snapshot for the local node (CPU%, RAM MB, sleep state, predicted spawn, tickless runtime data, and neighbors).
- `GET /hypermesh/routes` (admin) – shortcut to the current HyperRoute table (top candidate nodes, estimated latency/score, route class, reasoning notes).
- `GET /hypermesh/events?limit=50` (admin) – lists recent Hypermesh events (perf alerts, self-heal actions) recorded by MeshSurgeon.
- `GET /hypermesh/agents` (admin) – documents the active Module 5 agents (PerfWatch, MeshSurgeon, HyperRoute) plus their telemetry keys/responsibilities.
- Data is persisted inside `hypermesh_nodes`/`hypermesh_events` tables and mirrored to `config/snrl-state.json` trust metadata so Module 5 survives restarts.
- For low-level runtime experimentation, see `services/uor-engine/` (Rust microkernel + WASM loader) which powers the forthcoming UOR Engine deployments.

### 2.27 Global Trust, PQC, and Security (Module 6)
- `GET /trust/status` (admin) – PQC/DTC snapshot including current Kyber/Dilithium-style fingerprint, trust score, PTA anomaly metrics, and safe optimization policy instructions.
- `GET /trust/anchors?limit=50` (admin) – immutable history of trust anchors per node (algorithm, fingerprint, rotation reason). Keys are stored in `trust_anchors` and shared with Module 4’s trust anchor chain.
- `GET /trust/sessions?limit=50` (admin) – active PQC sessions with peer nodes plus threat scores (0–1). Useful for HyperRoute/Infra dashboards.
- `GET /trust/events?limit=50` (admin) – predictive or security events generated by PTA-Agent (rogue nodes, latency spikes, replication advisories).
- `GET /trust/pta` (admin) – the raw Predictive Threat Analyzer report (anomaly score, suggested mitigations) for automation tools or FLOW ops.
- TrustService runs tickless (idle footprint <35 MB) and never exposes private keys; only fingerprints + metadata are returned.

### 2.28 Hybrid Query & Reasoning (Module 8)
- `POST /hybrid/query` – body `{ sql?, semanticText?, naturalLanguage?, mode?, graph?, limit? }`. Returns `{ plan, result, cacheHit }`. Plans describe vector/SQL/graph/fusion steps + cost estimates.
- `GET /hybrid/plans?limit=` – inspect cached plans (id, mode, steps, createdAt, costEstimate).
- `GET /hybrid/cache` – view result cache entries (expires, engine, row counts).
- `GET /hybrid/profiles?limit=` – latency/perf profiler records (planId, latencyMs, engine, timestamp).
- NL intents default to hybrid plans; keywords “graph/connection” force graph mode, “similar/like” force vector mode. All queries respect project scoping and piggyback on Module 6 RBAC.

### 2.29 Streams & Event Processing (Module 9)
- `POST /streams` / `GET /streams` / `GET /streams/{id}` – manage real-time streams (name, kind, retention, description).
- `POST /streams/{id}/events` – append an event (`{ payload, latencyMs?, throughput? }`). Response includes `{ eventId, sequence }`.
- `GET /streams/{id}/events?since=&limit=` – fetch ordered events for replay/backfill.
- `POST /streams/{id}/checkpoints` – store processing checkpoints (`{ position, metadata? }`).
- `GET /streams/{id}/checkpoints` – retrieve checkpoint history.
- `GET /streams/{id}/profile` – live latency/throughput metrics for dashboards.

## 3. Health & Reference Endpoints
- `GET /health`
- `GET /info`
- `GET /` (HTML)

Use them for uptime checks or to populate your frontend quickstart tiles.

## 4. Common Workflows (curl)
```bash
# Waitlist signup
curl -X POST https://voike.supremeuf.com/waitlist \
  -H 'content-type: application/json' \
  -d '{ "email": "founder@example.com", "name": "Ada" }'

# Approve waitlist + mint API key
curl -X POST https://voike.supremeuf.com/admin/waitlist/<WAITLIST_ID>/approve \
  -H 'x-voike-admin-token: <ADMIN_TOKEN>' \
  -H 'content-type: application/json' \
  -d '{ "organizationName": "Ada Labs", "projectName": "vector-api", "keyLabel": "primary" }'

# Hybrid query
curl -X POST https://voike.supremeuf.com/query \
  -H 'x-voike-api-key: <PROJECT_KEY>' \
  -H 'content-type: application/json' \
  -d '{ "kind": "hybrid", "sql": "SELECT * FROM scientists WHERE score > 95", "semanticText": "legendary scientist" }'

# Blob manifest
curl -X GET https://voike.supremeuf.com/blobs/<BLOB_ID>/manifest \
  -H 'x-voike-api-key: <PROJECT_KEY>'

# WebSocket events (example with wscat)
VOIKE_API_KEY=<PROJECT_KEY> wscat -c wss://voike.supremeuf.com/events -H "x-voike-api-key: $VOIKE_API_KEY"

# Update SLO
curl -X PUT https://voike.supremeuf.com/ops/slos \
  -H 'x-voike-api-key: <PROJECT_KEY>' \
  -H 'content-type: application/json' \
  -d '{ "p95QueryLatencyMs": 120, "availabilityTarget": 0.999 }'
```

## 5. Integration Notes
- Control-plane tables (`organizations`, `projects`, `api_keys`, `waitlist`) live beside VDB data inside Postgres; everything is transactional.
- Ingestion jobs, ledger entries, kernels, DAI states, telemetry, BlobGrid manifests, IRX metrics, capsules, and MCP traces are tagged with `project_id` for multi-tenant isolation.
- Edge nodes serve cached/offline data instantly and reconcile to online state as soon as WAN returns—no stale UI states.
- Ops Autopilot surfaces advisories whenever SLOs are breached; enable chaos mode via env vars (`CHAOS_ENABLED`, `CHAOS_FAULT_PROBABILITY`, `CHAOS_MAX_DELAY_MS`) in staging to test resilience paths.
- Scripts + SDKs read `VOIKE_API_KEY`, `VOIKE_BASE_URL`, and (optionally) `VOIKE_ADMIN_TOKEN` from env.
- `/` can be embedded directly in your frontend; `/info` powers CLI/SDK onboarding flows.

## 6. Regression Coverage
- `npm run regression` (TypeScript) – CSV ingest → `/ingest/{jobId}` polling → `/query` → `/kernel/state` → `/ledger/recent`.
- `python scripts/voike_regression.py` – All of the above **plus** waitlist signup, optional admin approval (if `VOIKE_ADMIN_TOKEN` is set), builder password setup + login, `/user/profile`, `/user/projects`, secondary ingestion/query using the newly minted API key, `/metrics`, `/mcp/*`, and Fibonacci SQL benchmarking.
- `python scripts/voike_full_system_regression.py` – Modules 1–9 end-to-end check (core health/mesh/genesis, SNRL + Hypermesh + Trust, Omni Ingestion, Hybrid Query, Streams, and a split Grid Fibonacci job with node-parallelism diagnostics). Uses the same `.env`/Playground env vars as Docker.

## 7. References
- `README.md` – deployment & operational guide (Docker-only bootstrap on any machine).
- `docs/openapi.yaml` – machine-readable schemas (perfect for SDK or typed clients).
- `docs/kernels/Kernel8/*`, `docs/kernels/Kernel9/*` – kernel math, APIs, and benchmarking.
- `docs/developer/*.md` – BlobGrid, Edge, IRX, Grid, Playground, Capsules deep dives.
- `docs/infinity_fabric.md` – provider/pool architecture, sustainability considerations, CLI roadmap.
