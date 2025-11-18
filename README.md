# VOIKE Core • AI • Chat

> **One backend, one API key, three capabilities.**
>
> **VOIKE Core** stores your data & blobs and runs compute.
> **VOIKE AI** learns from that data and suggests better flows.
> **VOIKE Chat** is your per-project copilot powered by the Knowledge Fabric.

```
Clients / CLI / SDK
        │
        ▼
HTTP API + MCP Tools ──► Kernels + Truth Ledger
        │
        ▼
Hybrid DB + BlobGrid + Compute Grid
```

## 1. VOIKE at a Glance

| Thing | Description | Key Endpoints |
| --- | --- | --- |
| **Core** | Ingest CSV/JSON/Parquet/etc., query SQL/hybrid, store blobs, run grid jobs, create Time Capsules. | `/ingest/file`, `/query`, `/blobs`, `/grid/jobs`, `/capsules` |
| **AI** | Knowledge Atlas, IRX heatmap, ops runbooks, pipeline/capsule suggestions, Knowledge Fabric Q&A. | `/ai/atlas`, `/ai/ask`, `/ai/pipelines/analyze`, `/ai/capsule/timeline`, `/ai/irx/*` |
| **Chat** | Project-scoped chat sessions that log messages, call the Knowledge Fabric, and learn new flows. | `/chat`, `/chat/sessions`, `/chat/sessions/:id/messages` |

Everything is scoped by `X-VOIKE-API-Key`. Give each project its own key. No cross-project leakage.

---

## 2. Quickstart (5 minutes)

### 2.1 Boot VOIKE
```bash
git clone https://github.com/Rishhhhh/voike.git
cd voike
npm install
cp .env.example .env   # customize as needed
docker compose up -d --build
```
Docker spins up the backend plus Postgres. `/` serves the docs landing page; `/info` returns the same payload as JSON.

### 2.1.1 Shared Postgres (multi-node)
If you want multiple VOIKE nodes (Mac + Linux, edge + core) to share the same control-plane database, run the helper script on every machine before starting Docker:
```bash
# Replace the URL with your managed/remote Postgres instance
VOIKE_SHARED_DATABASE_URL=postgres://user:pass@host:5432/voikex \
node scripts/set_shared_db.js
```
This rewrites `.env` to point `DATABASE_URL` at the shared instance so `/mesh/nodes` and `/grid/jobs` are synchronized across nodes.

### 2.2 Get an API key (playground route)
```bash
curl -X POST http://localhost:8080/admin/projects \
  -H 'content-type: application/json' \
  -H 'x-voike-admin-token: <ADMIN_TOKEN>' \
  -d '{ "organizationName": "demo", "projectName": "playground", "keyLabel": "primary" }'
```
Response includes `project.id` + `apiKey.key`. Use that key for every protected endpoint.

### 2.3 Ingest + Query
```bash
VOIKE_API_KEY=<key>

curl -X POST http://localhost:8080/ingest/file \
  -H "x-voike-api-key: $VOIKE_API_KEY" \
  -H "content-type: multipart/form-data" \
  -F "file=@examples/demo.csv"

curl -X POST http://localhost:8080/query \
  -H "x-voike-api-key: $VOIKE_API_KEY" \
  -H "content-type: application/json" \
  -d '{ "kind": "hybrid", "sql": "SELECT * FROM demo WHERE score > 90" }'
```
VOIKE detects format, creates the table, and hybrid queries combine SQL + semantic search.

### 2.4 Ask the Knowledge Fabric
```bash
curl -X POST http://localhost:8080/ai/ask \
  -H "x-voike-api-key: $VOIKE_API_KEY" \
  -H "content-type: application/json" \
  -d '{ "question": "What changed this week?" }'
```
AI replies with summaries pulled from ingestion/query/blob/grid/ledger events. Control visibility via `/ai/policy`.

### 2.5 Chat
```bash
curl -X POST http://localhost:8080/chat \
  -H "x-voike-api-key: $VOIKE_API_KEY" \
  -H "content-type: application/json" \
  -d '{ "message": "Show me top customers this month" }'
```
Returns:
```json
{ "sessionId": "...", "reply": "...", "policy": "summaries", "answers": [...] }
```
Follow-up messages include `sessionId` to keep context. VOIKE stores the transcript and actions.

---

## 3. VOIKE Core (Data • Blobs • Compute)

### 3.1 Ingestion / Query
- `POST /ingest/file` – detect format, create table, log job.
- `GET /ingest/{jobId}` – status/summary.
- `POST /query` – SQL, semantic, or hybrid queries; returns corrected query + metrics.
- `GET /kernel/state` – VAR energy, DAI hints, and query limits.
- `GET /ledger/recent` / `GET /ledger/{id}` – Truth Ledger entries per project.

### 3.2 BlobGrid
- `POST /blobs` – upload (replication or erasure coding).
- `GET /blobs/{id}/manifest` – chunks + storage metadata.
- `GET /blobs/{id}/stream` – returns the file (stitches cached + remote chunks).
- `/blobgrid` automatically feeds IRX + edge caches; uploading videos is a great playground demo (upload on one client, stream from another).

### 3.3 Grid Jobs / VVM / Capsules
- `POST /grid/jobs` – submit `llm.infer`, `media.transcode`, `query.analytics`, custom jobs.
- `GET /grid/jobs/{id}` – status/result/logs.
- `POST /vvm` + `POST /vvm/{id}/build` – wrap workloads and build artifacts.
- `POST /capsules` / `GET /capsules/{id}` / `POST /capsules/{id}/restore` – snapshot & restore entire universes (schemas + blobs + VVMs).

### 3.4 Infinity & Mesh (for ops teams)
- `GET /infinity/nodes`, `/infinity/pools` – see provider/region/cost metadata; create pools with selectors/policies.
- `GET /mesh/self`, `/mesh/nodes`, `/genesis` – inspect node identity & cluster config.

---

## 4. VOIKE AI (Knowledge Fabric)

AI passively watches ingestion, query, blob, grid, and ledger streams. It builds:
- **Knowledge Atlas** (`/ai/atlas`, `/ai/atlas/table/:table`)
- **Knowledge Fabric Q&A** (`/ai/policy`, `/ai/ask`)
- **Ops triage** (`/ai/ops/triage`) with runbook suggestions
- **IRX heatmaps** (`/ai/irx/*`)
- **Pipeline proposals** (`/ai/pipelines/analyze`)
- **Capsule narratives** (`/ai/capsule/summary`, `/ai/capsule/timeline`)
- **Suggestions** (`/ai/suggestions` approve/reject)

Change data visibility via `/ai/policy` (`none`, `metadata`, `summaries`, `full`). Default is `summaries`.

Telemetry wiring:
- `/ingest` + `/query` + `/blobs` + `/grid/jobs` + `/ledger` events automatically create knowledge nodes (`ai_knowledge_nodes`).
- Use `python scripts/voike_heartbeat.py` for a fast health probe (Core + AI endpoints).
- Run `python scripts/voike_regression.py` for the full smoke test (ingest → query → MCP → AI → mesh).

---

## 5. VOIKE Chat

Chat sessions are stored in `chat_sessions` + `chat_messages`. Each `POST /chat` call:
1. Ensures a session exists (creates one if absent).
2. Saves the user message.
3. Calls `/ai/ask` to fetch Knowledge Fabric answers.
4. Saves the assistant reply (with policy + actions).

Endpoints:
- `POST /chat` – send a message (optional `sessionId`).
- `GET /chat/sessions` – list most recent sessions.
- `GET /chat/sessions/{id}/messages` – fetch transcripts (roles, actions).

Use chat data to discover recurring patterns; AI already uses it to suggest HyperFlows via `/ai/pipelines/analyze` → `/ai/suggestions`.

---

## 6. VOIKE FLOW (Semantic Plans)

- FLOW turns long-form code (Python/C++/SQL/TF) into compact, step-based plans.
- REST/APIX endpoints:
  - `POST /flow/parse` → validate FLOW source (returns AST + warnings).
  - `POST /flow/plan` → compile FLOW source into a plan graph (stored per project, returns `planId` + nodes/edges).
  - `POST /flow/execute` → run plans sync or async (Grid jobs; returns outputs/metrics or async `jobId`).
  - `GET /flow/plans`, `GET /flow/plans/{id}`, `DELETE /flow/plans/{id}` – manage plans.
  - `GET /flow/ops` → discover available FLOW op contracts; `GET /flow/ops/{name}` → inspect a specific op.
- Open `/playground/flow-ui` in your VOIKE deployment to get a Tailwind FLOW playground (paste API key, hit Parse/Plan/Execute, see AST/plan/outputs). Works great with `VOIKE_PLAYGROUND_API_KEY` for demos.
- LLM agents use the FLOW spec + APIX ops to generate plans automatically.

### Stack overview
1. **Adapters / Sources** – Python, C/C++, Rust, SQL, TypeScript, TF graphs, ONNX, notebooks, natural-language specs. Adapters parse these and emit FLOW.
2. **FLOW** – declarative, step-based plans (`*.flow`). Minimal syntax, easy for humans/LLMs.
3. **Execution Plan Graph** – FLOW compiles into graph nodes (FLOW_OP, VASM blocks, VVM jobs) with IRX/scheduling metadata.
4. **VASM** – tiny, architecture-independent VM instructions (arithmetic, control flow, VOIKE syscalls).
5. **Hardware / Grid** – CPU/GPU/edge nodes orchestrated by VOIKE (Infinity Fabric, IRX telemetry).

### Key concepts
- **FLOW opcodes** cover semantic actions (`LOAD CSV`, `FILTER`, `GROUP`, `RUN_JOB`, `RUN_AGENT`). Ops are versioned (`OP@MAJOR.MINOR`) so plans stay stable.
- **Meta orchestration ops** (`APX_EXEC`, `BUILD_VPKG`, `DEPLOY_SERVICE`, `OUTPUT_TEXT`) are available inside FLOW so the same plan can describe repo bootstrap, packaging, and deployment directly through VOIKE.
- **VVM descriptors** wrap external runtimes (Python, C++, TF Serving, etc.) with env requirements and IO schemas.
- **Agents** contribute FLOW by calling APIX (`flow.parse/plan/execute`, `agent.*` ops) and logging to `/orchestrator/tasks`.
- **Capsules** snapshot FLOW + plans + artifacts for reproducibility.
- `flows/voike-regression.flow` is a codified version of the full regression run: it ingests sample data, runs hybrid queries, dispatches a grid Fibonacci job, builds VPKGs, deploys services, and captures a capsule so you can replay the entire smoke test through VOIKE itself.

### Goals
- **Universal**: any language/framework becomes a FLOW plan + VPKG deployment.
- **Compact**: large imperative code compresses into ~10–20 FLOW steps.
- **Safe & stable**: ops are versioned; plans only change when you opt in.
- **Optimizable**: plan graph metadata allows IRX/DAI/AI Fabric to schedule and improve workflows.

## 7. CLI, Scripts & VPKG

- `npm run lint` – TypeScript type-check (tsc --noEmit).
- `npm run regression` – TypeScript regression harness (CSV ingest → query → kernel/ledger).
- `python scripts/voike_regression.py` – full Python regression (ingest, query, MCP, blob, VVM, Ops, APIX, AI, mesh).
- `python scripts/voike_heartbeat.py` – lightweight Core+AI check (health, query, AI policy/ask, IRX, pipeline analysis).
- `npm run seed` – optional seeding script (ensures migrations + sample data).
- CLI (in `cli/`) now includes:
  - `voike build` – package the current repo into a `.vpkg` bundle (reads `vpkg.yaml`). Add `--publish` to push to your VOIKE project or `--vvm <id>` to trigger the legacy Grid build.
  - `voike get <name>@<version>` – download a bundle (HTTP or local cache at `~/.voike/registry`) and extract files for rapid bootstrapping.
  - `voike launch <bundle.vpkg>` – upload a bundle and provision an app (`/apps/:id`) without touching Docker.
- `voike env add/list` – manage environment descriptors (`/env/descriptors`) that describe Docker or baremetal builds; VOIKE honors `VOIKE_NODE_MODE` to pick the right runner.
- `voike task create/list/show/run-agent` – interact with the orchestrator (`/orchestrator/tasks`, `/orchestrator/tasks/:id/run-agent`) to seed tasks and trigger planner/codegen/tester agents.
- `voike peacock build/launch/evolve` – helper commands for the Peacock builder (packages the `peacock/` VPKG, launches it via `/vpkgs/launch`, and invokes FLOW plans for website generation).
- `voike agent answer --question "..."` – hits `/agents/fast-answer` to demonstrate the fast multi-agent FLOW pipeline.
- `voike app onboard --project <id> --source-type repo --identifier <giturl>` – reads `flows/onboard-foreign-app.flow`, plans it, executes it, and prints the onboarding summary.
- `python scripts/grid.py --mode split --n 10000 --show-segments` – submits a split Fibonacci job to the grid scheduler, spawns child jobs across nodes, and prints which node processed each segment (great for validating mesh/parallel compute).
- `python scripts/voike_regression.py --grid-fib 2000` – end-to-end regression harness that now includes a grid Fibonacci job (the script can be wrapped into a VPKG via `voike wrap scripts/voike_regression.py` and launched like any other workload).
- Existing helpers (`voike init`, `voike wrap`, `voike status`, `voike logs`) still ship for scaffolding.

## 6.1 SNRL + V-DNS (Phase 1 foundation)
- `/snrl/resolve` returns a signed endpoint recommendation for any domain using the new FLOW plan `flows/snrl-semantic.flow`. The resolver runs through FLOW → APX → `SnrlService`, so you can iterate on the plan without redeploying binaries.
- `config/snrl-endpoints.json` seeds the initial POP metadata. Update it or feed from MCP to reflect real POPs.
- `node scripts/set_shared_db.js --url <postgres-url>` configures both Mac + Linux nodes to share a single Postgres control plane so mesh state, grid jobs, and SNRL flows stay in sync.

Example:

```bash
curl -X POST http://localhost:8080/snrl/resolve \
  -H 'content-type: application/json' \
  -H 'x-voike-api-key: <PROJECT_KEY>' \
  -d '{ "domain": "api.voike.com", "client": { "region": "ap-sg", "capabilities": ["http","gpu"] } }'
```

Response:

```json
{
  "domain": "api.voike.com",
  "candidates": [ ... ],
  "signature": "<sha256>",
  "issuedAt": "2025-11-18T10:00:00Z",
  "ttl": 30
}
```

### LLM configuration
- Set `OPENAI_API_KEY`, `OPENAI_BASE_URL` (default `https://api.openai.com`), and `OPENAI_MODEL` (`gpt-5.1` by default) in `.env` to enable real GPT-backed flows (`/agents/fast-answer`, `flows/*` with `RUN AGENT`).
- See `flow/docs/VPKG-spec.md` for the manifest format and what files are included inside each bundle.
- Set `VOIKE_NODE_MODE=docker` (default) or `VOIKE_NODE_MODE=baremetal` to control how env descriptors run. Docker mode wraps commands via `docker run`; baremetal executes commands locally with your system packages.

---

## 8. Ops / Admin

- **Waitlist & provisioning**: `POST /waitlist`, `GET /admin/waitlist`, `POST /admin/waitlist/:id/approve`, `POST /admin/projects`.
- **Builder auth**: `/auth/check-whitelist`, `/auth/setup-password`, `/auth/login`, `/user/*`.
- **Ops SLOs**: `GET/PUT /ops/slos`, `GET /ops/advisories`.
- **Chaos testing**: Env vars (`CHAOS_ENABLED`, `CHAOS_FAULT_PROBABILITY`, etc.) inject faults to stress ingest/query paths.
- **Metrics**: `GET /metrics` for gauges/counters; WebSocket `/events` for realtime telemetry.

---

## 9. Playground & Landing Page Tips

- Create a Playground project/API key and publish it in docs (`VOIKE_PLAYGROUND_API_KEY`). Use it on the landing page to show:
  - Recent ingest jobs & queries.
  - Blob uploads (e.g., stream a video live).
  - AI Atlas entries & Knowledge Fabric responses.
  - Chat transcripts (public/safe sample data).
- The docs landing (`GET /`) already includes a Tailwind handbook; customize it to show live API responses (health, metrics, AI, chat).
- For demo pitches (e.g., to Google), walk through:
  1. `/ingest/file` (CSV) → `/query`.
  2. `/blobs` upload → `/blobs/{id}/stream`.
  3. `/ai/atlas` + `/ai/ask` for Knowledge Fabric.
  4. `/ai/pipelines/analyze` to show auto HyperFlow suggestions.
  5. `/chat` conversation referencing freshly ingested data.

---

## 10. Keep VOIKE Healthy

1. **Heartbeat**: schedule `python scripts/voike_heartbeat.py` every few minutes. It fails fast if the playground isn’t responding.
2. **Regression**: run `python scripts/voike_regression.py` before releases or major upgrades.
3. **Telemetry**: watch `/metrics`, `/ops/advisories`, `/ai/ops/triage`. AI triage surfaces runbooks.
4. **Capsules**: create periodic snapshots (`POST /capsules`) before risky deployments.
5. **Docs**: update `docs/api.md`, `docs/regression_playground.md`, `docs/ai_fabric.md` when adding new endpoints so external teams stay aligned.

---

## 11. VOIKE 3.0 Orchestrator (Preview)

VOIKE is starting to run itself. The orchestrator now persists a full project graph inside Postgres and exposes `/orchestrator/*` APIs so agents (or humans) can:

- `POST /orchestrator/projects` + `GET /orchestrator/projects/:id` – register/inspect projects (including `voike-core`).
- `POST /orchestrator/projects/:id/graph` – upload modules, dependencies, and endpoints discovered during a repo scan; `GET /.../graph` returns the map.
- `POST /orchestrator/agents` / `GET /orchestrator/agents` – declare planner/codegen/tester/infra personas.
- `POST /orchestrator/tasks` / `GET /orchestrator/tasks` / `GET /orchestrator/tasks/:id` – create and track orchestration runs (each with steps/status/history).
- `flow/docs/ORCH-FLOW.md` documents the FLOW profile agents follow (`RUN AGENT`, `RUN JOB`, `ASK_AI`, etc.) so Planner/Codegen/Tester/Infra steps stay consistent.
- `flows/fast-agentic-answer.flow` pairs with `/agents/fast-answer` / `voike agent answer` to demonstrate the multi-agent planner → reasoning → facts → code → critique → stitch loop (all steps logged in `/orchestrator/tasks`).
- `flows/onboard-foreign-app.flow` encodes the Lovable/Replit/Supabase import pipeline; run it via `voike app onboard` (which uses `/flow/plan` + `/flow/execute`) and watch `/orchestrator/tasks` capture each migration step.
- `flows/voike-meta.flow` describes bootstrapping VOIKE itself (DB/kernels/VASM/envs/VVMs/peacock/etc.), while `flows/voike-self-evolve.flow` captures how Planner/Codegen/Tester/Infra/Product agents evolve VOIKE end-to-end.

Upcoming phases will attach Capsules to each task, wire CLI helpers (`voike task`, `voike evolve`), and let FLOW drive the entire evolution loop.

Remember the mantra for VOIKE 3.0:

> *The whole development, deployment, evolution of VOIKE runs **through** VOIKE, driven by FLOW, VPKGs, and agents. Humans steer; VOIKE grinds.*
