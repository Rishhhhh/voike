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
cp .env.example .env   # edit any overrides
docker compose up -d --build
```
That’s it. Every dependency (backend, Postgres, POP stack) builds inside Docker—no local `npm install`, no extra seeds, no manual scripts. As soon as the compose stack is up, `/` serves the docs landing page and `/info` exposes the same payload as JSON. Bring `.env` with you (or edit it in-place) and the exact same command works behind NAT, on laptops, bare metal, tunnels, static IPs, AWS, GCP—anywhere you have Docker and outbound internet.

> Want the full architecture narrative? Read `docs/whitepaper.md`. Need API-level detail? See `docs/api.md`.

**Docs Map**

| Phase | Deliverables | Primary References |
| --- | --- | --- |
| **Phase 1–3** | Genesis seeding, shared Postgres, POP stack (SNRL + VDNS) | `docs/phase3_pop.md`, `docs/phase4_auto-bootstrap.md`, README §§2.6–2.7 |
| **Phase 4** | Auto-bootstrap + auto-registration (`docker compose up -d --build` everywhere) | README §2.7, `docs/deployment_docker.md`, `docs/deployment_baremetal.md` |
| **Phase 5** | Agentic FLOW (Planner/Codegen/Tester/Infra/Product) + CI | README §2.8, `docs/phase5_agents.md`, `.github/workflows/agentic-flow.yml` |
| **Phase 6** | Deployment tooling, Helm/Compose templates, POP verification scripts | README §2.9, `docs/deployment_*`, `scripts/verify_pop.py`, `deploy/` |
| **Phase 7** | Multi-platform adapters (Firebase/Supabase, Flask, React, Rust, Postgres) | README §2.10, `adapters/README.md`, `docs/migration_guides.md` |
| **Phase 8** | Resilience tooling (capsules, ledger replay/anchor, offline sync, chaos playbooks) | README §2.11, `docs/resilience_playbooks.md`, `scripts/ledger_replay.py`, `scripts/offline_sync.py` |
| **White Paper** | Full narrative across Phases 1–8 | `docs/whitepaper.md` |

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

### 2.6 Phase 1 – Genesis / Control-Plane Bootstrap
Run this once on the canonical node (e.g., `voike.supremeuf.com`) to seed the control-plane Postgres with the authoritative DNS + resolver metadata. Every future `docker compose up -d --build` will then read the state via `GENESIS_BOOTSTRAP=1`.

```bash
# assumes GENESIS_ADMIN_TOKEN/VOIKE_ADMIN_TOKEN is set
node scripts/genesis_seed.js \
  --core-url https://voike.supremeuf.com \
  --zones config/vdns-zones.json \
  --endpoints config/snrl-endpoints.json
```

After seeding, smoke-test the control plane:

```bash
curl -H "x-voike-admin-token: $GENESIS_ADMIN_TOKEN" https://voike.supremeuf.com/vdns/zones
curl -H "x-voike-admin-token: $GENESIS_ADMIN_TOKEN" https://voike.supremeuf.com/snrl/endpoints
curl -H "x-voike-api-key: <PROJECT_KEY>" -d '{ "domain": "api.voike.com" }' \
  https://voike.supremeuf.com/snrl/resolve
```

Nodes brought up with `GENESIS_BOOTSTRAP=1` now fetch the seeded zone/endpoints automatically before serving traffic.

### 2.7 Phase 4 – Auto-Bootstrap + Auto-Registration (one command forever)
After Phase 1 is complete, every additional VOIKE node (backend + POP stack) can be launched and registered with a single command:

```bash
docker compose up -d --build
```

The backend automatically hydrates from Genesis (`GENESIS_BOOTSTRAP=1`), advertises itself back (`GENESIS_REGISTER=1`), and the POP containers begin serving DoH/UDP/TCP immediately. See `docs/phase4_auto-bootstrap.md` for verification tips and environment overrides.

### 2.8 Phase 5 – Agentic Self-Evolution + CI/CD

- `flows/voike-self-evolve.flow` now encodes the full Planner → Codegen → Tester → Infra → Product loop. Use it to turn any Markdown spec into orchestrator steps.
- Agents run through `EvolutionAgentService`, so every `RUN AGENT` call creates/updates `/orchestrator/tasks` records automatically (no stub handlers). The Planner reads `docs/phase5_agents.md` by default; pass `featureSpecOverride` to stream inline specs from CI.
- `.github/workflows/agentic-flow.yml` invokes `/flow/plan` + `/flow/execute` using the Playground API. Configure `VOIKE_API_URL`, `VOIKE_API_KEY`, and `VOIKE_PROJECT_ID` secrets and the workflow prints the Product agent summary on every push/PR.
- Tester parses changed `.flow` files through the FLOW compiler and ensures referenced files exist; Infra emits deployment/capsule commands so demos stay reproducible with a single `docker compose up -d --build`.
- See `docs/phase5_agents.md` for the spec template, curl examples, and Playground tips.

### 2.9 Phase 6 – Deployment Tooling & CI/CD (Playground or DIY)

- Two dedicated deployment guides (`docs/deployment_docker.md`, `docs/deployment_baremetal.md`) walk through Compose/Helm clusters or bare-metal installs—choose to “run VOIKE with us” (connect to the Playground) or “run VOIKE yourself” and auto-join the decentralized network.
- `.env.example` now lists every `VOIKE_NODE_*`, Genesis, POP, and SNRL variable required for automatic bootstrap/registration so plug-and-play nodes start with zero guesswork.
- Reference templates live in `deploy/compose/voike-playground.compose.yml` and `deploy/helm/voike/` (Deployment + Service + values). Drop them into Docker or Kubernetes to spin up FLOW/VASM/VVM stacks quickly.
- Helper scripts (`scripts/make_capsule_snapshot.py`, `scripts/export_ledger.py`, `scripts/verify_pop.py`) handle capsule snapshots, ledger exports, and POP verification from laptops or CI.
- Additional GitHub Actions (`flow-tests.yml`, `snapshot-ci.yml`) show how to run FLOW plan checks and Capsule snapshots directly against the Playground API. Copy them to keep your own repos in lockstep.

> Every deployment story (cloud, bare metal, NAT, tunnels) still reduces to **copy `.env` → `docker compose up -d --build`**. The defaults in `.env.example` make new nodes hydrate from Genesis and self-register, so you never run extra bootstrap commands.

### 2.10 Phase 7 – Multi-Platform Adapters (Firebase/Supabase, Flask, React, Rust, Postgres)

- New adapter templates live under `adapters/` with dedicated READMEs/code for Firebase/Supabase, Flask, React, Rust, and Postgres.
- Each adapter demonstrates dual-write, shadow mode, and failover logic (including VDNS/SNRL lookup) so you can reroute existing apps through VOIKE without downtime.
- `docs/migration_guides.md` explains how to roll out dual-write → shadow → failover phases across stacks, referencing the provided adapters.
- Templates include fallback caching (React hook + Flask blueprint), worker patterns (Rust), and SQL triggers (Postgres) so “run VOIKE with us” or “run VOIKE yourself” is one copy/paste away.

### 2.11 Phase 8 – Resilience Tooling & Offline Ops

- New ledger replay + anchoring APIs (`POST /ledger/replay`, `POST /ledger/anchor`) drive snapshots, audits, and rollback loops.
- CLI helpers (`scripts/ledger_replay.py`, `scripts/offline_sync.py`) replay append-only ledgers, sync caches offline, and pair with `docs/resilience_playbooks.md` for full outage playbooks.
- Capsule snapshot tooling + `snapshot-ci.yml` keep reproducible artifacts handy; chaos guidance (Phase 8 doc) shows how to simulate DNS/cloud outages and verify POP health afterward.
- README + docs cover rollback/replay + offline instructions so ops teams can run VOIKE completely disconnected when needed.

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
- **Agentic orchestration** – `EvolutionAgentService` powers the `planner`, `codegen`, `tester`, `infra`, and `product` agents used by `flows/voike-self-evolve.flow`. Each call logs to `/orchestrator/tasks` automatically and optionally uses GPT when `OPENAI_API_KEY` is provided.
- **VVM descriptors** wrap external runtimes (Python, C++, TF Serving, etc.) with env requirements and IO schemas.
- **Agents** contribute FLOW by calling APIX (`flow.parse/plan/execute`, `agent.*` ops) and logging to `/orchestrator/tasks`.
- **Capsules** snapshot FLOW + plans + artifacts for reproducibility.
- `flows/voike-regression.flow` is a codified version of the full regression run: it ingests sample data, runs hybrid queries, dispatches a grid Fibonacci job, builds VPKGs, deploys services, and captures a capsule so you can replay the entire smoke test through VOIKE itself.
- The `APX_EXEC "source.readFile"` target reads specs from the repo root and falls back to inline text (`featureSpecOverride`) so CI/CD jobs can stream specs without mounting the filesystem.

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
- `python scripts/make_capsule_snapshot.py --memo "Nightly" ...` – capture Capsule snapshots (invoked by the snapshot CI workflow).
- `python scripts/export_ledger.py --output ledger.json ...` – export Truth Ledger entries for audits/backups.
- `python scripts/verify_pop.py --domain api.voike.com ...` – confirm POP/SNRL/VDNS health anywhere you have cURL access.
- `python scripts/ledger_replay.py --since "..."`
  – replay append-only ledger entries locally and verify virtual energy changes before rollbacks.
- `python scripts/offline_sync.py --interval 0 --capsules`
  – prefetch ledger/capsule data into a local cache so apps keep running when cloud dependencies go dark.
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

## 6.2 VDNS Zone Management (Phase 2)
- Zone definitions live in `config/vdns-zones.json`. Each record update bumps the zone serial automatically.
- `flows/vdns-zone-sync.flow` automates zone export + record inserts through FLOW/APX, so you can version-control DNS operations.
- HTTP admin endpoints:
  - `GET /vdns/zones` – list zones.
  - `GET /vdns/zones/:id/export` – emit BIND/Knot-compatible zone text.
  - `POST /vdns/records` – append a DNS record (`{ zoneId, record }`).

Example: add A record and export zone

```bash
curl -X POST http://localhost:8080/vdns/records \
  -H 'content-type: application/json' \
  -H 'x-voike-admin-token: <ADMIN_TOKEN>' \
  -d '{ "zoneId": "voike-com", "record": { "type": "A", "name": "edge.voike.com.", "value": "203.0.113.55" } }'

curl -s http://localhost:8080/vdns/zones/voike-com/export \
  -H 'x-voike-admin-token: <ADMIN_TOKEN>'
```

Use the exported zone file to feed Knot/NSD authoritative servers in the SNRL POPs. Combined with `/snrl/resolve`, VOIKE now controls both semantic resolution and the authoritative DNS zone state.

## 6.3 Phase 3 POP deployment (DoH/DoT + Authoritative DNS)

Phase 3 turns the control-plane pieces above into runnable resolver POPs so you can decommission Cloudflare and serve `voike.supremeuf.com` directly from VOIKE-managed infrastructure.

1. **SNRL POP** – `services/snrl-pop` is a Fastify + DNS stack that terminates DoH (`/dns-query`), UDP/TCP port 53, and optional DoT (port 853). It proxies requests to `/snrl/resolve`, caches responses, and emits TXT/SRV metadata with SNRL signatures. Configure it via:
   - `SNRL_API_KEY` – VOIKE project API key with access to `/snrl/resolve`.
   - `SNRL_POP_REGION` / `SNRL_POP_CAPABILITIES` – advertised metadata for semantic routing.
   - Optional `SNRL_DOT_CERT_PATH` + `SNRL_DOT_KEY_PATH` if you want TLS-based DoT in addition to DoH.
   - Spin it up locally with `docker compose up snrl-pop` (ports: DoH `8053`, UDP/TCP `1053`, DoT `8853` by default).
2. **VDNS primaries/secondaries** – `services/vdns-primary` (Knot) and `services/vdns-secondary` (NSD) fetch exported zone text from `/vdns/zones/:id/export` using `VOIKE_ADMIN_TOKEN` and serve it authoritatively on port 53. Each container only needs `VDNS_ZONE_ID` + `VDNS_ZONE_DOMAIN` (defaults provided in `.env.example`). Launch them with `docker compose up vdns-primary vdns-secondary` to get primary (port `2053`) and secondary (port `3053`) name servers.
3. **POP rollout workflow** – documented in `docs/phase3_pop.md`: run `scripts/set_shared_db.js` to ensure every node shares control-plane Postgres, start the POP containers on Mac/Linux nodes, verify DoH responses (`curl -H 'accept: application/dns-message' --data-binary @query.bin http://localhost:8053/dns-query`) and DNS answers (`dig @127.0.0.1 -p 1053 voike.supremeuf.com`). Once healthy, update registrar glue/NS records to your POP IPs, wait for TTL expiry, then disable Cloudflare.

These services now live inside the repo so AI agents or ops engineers can build/publish POP images directly from VOIKE. Future enhancements (DNSSEC, Anycast/BGP automation, POP health probes) stack on top of this baseline without retooling.

## 6.4 Phase 4 (Genesis bootstrap + auto-registration)

- `GENESIS_BOOTSTRAP=1` — when enabled, the backend synchronizes `config/vdns-zones.json` and `config/snrl-endpoints.json` from the canonical Genesis deployment (`GENESIS_URL` + `GENESIS_ADMIN_TOKEN`) before services initialize, ensuring each node starts with the latest POP + DNS state.
- `GENESIS_REGISTER=1` — after boot, VOIKE auto-registers the node (SNRL endpoint + A/AAAA/NS records) with Genesis using `VOIKE_PUBLIC_*` envs (hostname, IP, region, capabilities, TTLs). Every `docker compose up -d --build` run now self-registers the host with `voike.supremeuf.com` so discovery never needs manual steps.
- VDNS containers poll `/vdns/zones/:id/export` on an interval (`VDNS_REFRESH_SECONDS`, default 60s) and hot-reload Knot/NSD whenever the zone changes. No manual restarts are required when `/vdns/records` updates fire from Genesis.
- Compose wiring ships all required env defaults (`GENESIS_*`, `VOIKE_PUBLIC_*`, `SNRL_*`, `VDNS_*`), so bringing up a fresh server only requires editing `.env` and running `docker compose up -d --build`. The backend, resolvers, POPs, and registration loop are all included.

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

Phase 5 wires those RUN_AGENT calls to the new `EvolutionAgentService`. Planner/Codegen/Tester/Infra/Product agents automatically:

- Ensure an orchestrator project exists (re-using the VOIKE project UUID).
- Create/update `/orchestrator/tasks` and append structured steps with summaries, diffs, and deployment commands.
- Parse FLOW specs (`source.readFile` supports inline overrides) so CI/CD jobs can replay the exact feature brief used locally.
- Feed the `.github/workflows/agentic-flow.yml` pipeline, which exercises Playground `/flow/plan` + `/flow/execute` and prints the Product summary during every push/PR when secrets are configured.

Upcoming phases will attach Capsules to each task, wire CLI helpers (`voike task`, `voike evolve`), and let FLOW drive the entire evolution loop.

Remember the mantra for VOIKE 3.0:

> *The whole development, deployment, evolution of VOIKE runs **through** VOIKE, driven by FLOW, VPKGs, and agents. Humans steer; VOIKE grinds.*
