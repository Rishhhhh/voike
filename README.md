# VOIKE-X Backend

VOIKE-X is a headless, MCP-native database engine that fuses hybrid Postgres/pgvector storage, universal ingestion, and transparent semantic kernels. There is **no GUI** baked in—developers interact entirely through HTTP, WebSocket, CLI scripts, or their own UIs.

```
Clients / CLI / SDK
        │
        ▼
HTTP API + MCP Tools ──► Kernels (VASVEL / VAR / VARVQCQC / DAI)
        │                                 │
        │                                 └────► Truth Ledger (per project)
        ▼
Hybrid VDB (SQL + Document + Vector + KV + Graph + Time-Series)
        │
        └────► Postgres + pgvector
```

## Feature Matrix
- **Hybrid VDB**: SQL tables, JSONB docs, vector embeddings, KV store, graph edges, time-series metrics.
- **Universal Ingestion Engine**: auto-detects JSON/CSV/XLSX/Parquet/SQL/PDF/log/binary → schema synth → engine selection → indexing.
- **Semantic Kernels**:
  - VASVELVOGVEG: deterministic candidate selection, ledger commit.
  - VAR: virtual energy tracker (per project).
  - VARVQCQC: query rewrite + correction metadata.
  - DAI: Developmental AI growth loop (cache/index hints learned from history).
- **MCP Orchestration**: tool registry (`db.query`, `kernel.*`, `uie.ingestFile`, etc.), contexts, event bus, optional WebSocket `/events`.
- **Multi-Tenant Control Plane**: Organizations → Projects → API Keys; per-project scoping for ledger, ingestion, metrics.
- **Telemetry**: `/metrics` snapshot, WebSocket events (`ingest.completed`, `query.executed`, `kernel.energyUpdated`, `dai.updateSuggested`).
- **Headless Landing**: `GET /` serves a Tailwind-based quickstart card; `GET /info` exposes JSON metadata.

## Authentication & Access
- **API keys**: send `X-VOIKE-API-Key` with every protected request.
- **Admin token**: provisioning endpoints require `X-VOIKE-ADMIN-TOKEN` (set via `ADMIN_TOKEN` env). Used to manage orgs/projects/keys and approve waitlist entries.
- **Waitlist flow**: `POST /waitlist` (no auth) captures emails. Admin approves via `POST /admin/waitlist/:id/approve`, which provisions an organization, project, and API key automatically.
- External portals can wrap these endpoints to build login/signup/approval UX without modifying this backend.

## Quickstart Handbook
1. **Clone & install deps (for lint/test)**  
   ```bash
   git clone https://github.com/Rishhhhh/voike.git
   cd voike
   npm install
   ```
2. **Configure environment**  
   Copy `.env.example` → `.env` and update:
   ```
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/voikex
   ADMIN_TOKEN=super-secret
   ```
3. **Bring up the stack** (backend + Postgres + pgvector):  
   ```bash
   docker compose up -d --build
   ```
   API lives at `http://localhost:8080`.
4. **Provision org + project + API key**  
   ```bash
   curl -X POST http://localhost:8080/admin/projects \
     -H 'content-type: application/json' \
     -H 'x-voike-admin-token: super-secret' \
     -d '{"projectName":"demo","organizationName":"acme","keyLabel":"primary"}'
   ```
   Save `apiKey.key` from the response.
5. **Exercise the API**  
   ```bash
   VOIKE_API_KEY=<key> VOIKE_BASE_URL=http://localhost:8080 npm run regression
   VOIKE_API_KEY=<key> VOIKE_BASE_URL=http://localhost:8080 python3 scripts/test.py
   ```
6. **Monitor**  
   - `GET /kernel/state` → virtual energy + DAI state.  
   - `GET /metrics` → last gauges.  
   - WebSocket `GET /events` with `X-VOIKE-API-Key` to stream ingest/query/kernel events.
7. **Deploy**  
   - Push to your edge host, `git pull`, `docker compose up -d --build`.  
   - Point Cloudflare (or another L7 proxy) at port 8080 for the public domain.
8. **Extend**  
   Build your own landing page / dashboard that calls these APIs (waitlist signup, admin approvals, ingestion dashboards). No changes needed on this backend.

## Developer Playground Scripts
- `npm run regression` (requires `VOIKE_API_KEY`, optional `VOIKE_BASE_URL`): uploads sample CSV, polls `/ingest/{job}`, hits `/query`, `/kernel/state`, `/ledger/recent`.
- `scripts/test.py`: ensures `users_demo` table exists, inserts hash rows, queries them.
- `scripts/query.py`: read-only demo query.
- `npm run seed`: CSV ingestion via UIE module (default project).
- `npm test`: Jest suite covering kernels, ingestion, VDB, auth gating.

## Primary API Groups
### Public
- `GET /` – Tailwind quickstart card.  
- `GET /info` – JSON payload describing headers + endpoints.  
- `GET /health` – system check.  
- `POST /waitlist` – add email/name to the early-access queue.

### Admin (header `X-VOIKE-ADMIN-TOKEN`)
- `GET /admin/waitlist`, `POST /admin/waitlist/:id/approve`
- `GET/POST /admin/organizations`
- `POST /admin/projects`, `POST /admin/organizations/:orgId/projects`
- `POST /admin/projects/:projectId/api-keys`

### Project (header `X-VOIKE-API-Key`)
- Ingestion: `POST /ingest/file`, `GET /ingest/{jobId}`.
- Query: `POST /query` (sql/semantic/hybrid).
- Kernels & Ledger: `GET /kernel/state`, `GET /ledger/recent`, `GET /ledger/:id`.
- MCP: `GET /mcp/tools`, `POST /mcp/execute`.
- Telemetry: `GET /metrics`, WebSocket `/events`.

Full schemas + sample payloads live in `docs/api.md` and `docs/openapi.yaml`.

## Deployment & Ops
- **Data persistence**: `postgres_data` Docker volume. Avoid `docker compose down -v` unless you intend to wipe data.
- **Scaling & HA**:
  - Run multiple VOIKE containers (voike1, voike2) pointing to a shared HA Postgres (managed instance, Patroni, etc.).
  - Put Cloudflare Load Balancer (or any L7 LB) in front of them; clients keep using `voike.supremeuf.com`.
  - The API key + per-project scoping make horizontal scaling stateless at the app layer.
- **Configuration**: set env vars for kernel hyperparameters, query limits, telemetry toggle, websocket enablement, admin token.

## Next Steps / Ideas
- Build a lightweight admin portal wrapping the existing waitlist/org/project endpoints (e.g., Next.js + Tailwind).
- Add CLI/SDKs (TypeScript, Python) that wrap `ingest`/`query` for developer onboarding.
- Add HA Postgres replication and metric shipping to a time-series system for production-grade observability.
- Extend MCP tools for remote job scheduling (compute/grid plugins) if needed.

For mathematical details, see `docs/kernels.md`. For endpoint specifics—including JSON contracts, curl samples, and MCP payloads—see `docs/api.md`.
