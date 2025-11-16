# VOIKE-X Backend

> MCP-native, kernel-aware database backend – **headless only**. Everything is API-first so you can bolt on your own landing page, admin console, or SDK.

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
- **Hybrid VDB**: SQL tables, JSONB docs, vector embeddings (`pgvector`), KV store, graph edges, basic time-series.
- **Universal Ingestion Engine (UIE)**: Accepts JSON, CSV, XLSX, Parquet, SQL dumps, PDFs, logs, binaries; auto-detects format + schema and materializes into VDB.
- **Kernels**:
  - **VASVELVOGVEG** – deterministic planning with Truth Ledger logging.
  - **VAR** – per-project virtual energy tracker (informs throttles + telemetry).
  - **VARVQCQC** – query corrector with transparent metadata.
  - **DAI** – Developmental AI growth state (cache TTL/index hints). *It never rewrites SQL—only tunes heuristics and metrics.*
- **MCP orchestration**: Tool registry (`db.query`, `uie.ingestFile`, `kernel.*`, `dai.state`), session contexts, event bus, optional WebSocket streaming.
- **Multi-tenant control plane**: Organizations → Projects → API keys, plus waitlist + admin provisioning endpoints.
- **Docs landing**: `GET /` renders a Tailwind handbook with headers, quickstart steps, and curl snippets; `/info` exposes the same as JSON.

## Multi-Tenant Access Model
1. **Waitlist** – `POST /waitlist` captures email/name (no auth). Admins list + approve entries.
2. **Admin token** – All provisioning endpoints require `X-VOIKE-ADMIN-TOKEN` (`ADMIN_TOKEN` env).
3. **Organizations & projects** – Approvals (or direct admin calls) mint orgs + projects.
4. **API keys** – `X-VOIKE-API-Key` authenticates ingestion/query/MCP endpoints. Projects can hold multiple keys (e.g., prod vs. staging).
5. **Playground key (optional)** – Set `PLAYGROUND_API_KEY` to auto-create a demo project/key that appears on `/` + `/info`. Use that for docs, a public playground, or sample SDKs. (If you skip this, VOIKE-X falls back to the default shown in `.env.example` so local Docker still works.)
6. **Admin/JWT fallbacks** – Missing `ADMIN_TOKEN`/`JWT_SECRET` automatically fall back to the `.env.example` defaults and log a warning. Override them in production.
6. **Builder accounts** – Each waitlist entry now maps to a `users` row. Approved users set their password via `/auth/setup-password` and manage their own orgs/projects/API keys via `/user/*`.

Data plane tables (ingest jobs, Truth Ledger, kernel states, DAI growth, telemetry events) are all tagged with `project_id`, so multi-tenant isolation is enforced server-side.

> Waitlist approvals still auto-mint the organization/project/API key tuple, but they now also mark the builder’s `users` record as **approved**. Builders hit `/auth/check-whitelist` to confirm approval, call `/auth/setup-password` once, and then sign in via `/auth/login` to manage their own orgs/projects/API keys through `/user/*` routes.

## Quickstart Handbook (8 Steps)
1. **Clone + install (for lint/tests only)**  
   ```bash
   git clone https://github.com/Rishhhhh/voike.git
   cd voike
   npm install
   ```
2. **Configure environment**  
   Copy `.env.example` → `.env` and update:
   ```env
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/voikex
   ADMIN_TOKEN=voike-admin-5bb6c26f3a89441f8fbf95c7088795e4
   PLAYGROUND_API_KEY=voike-playground-4d3a5a978ef44b3497329d861522c4b8   # optional but great for docs/testing
   JWT_SECRET=voike-jwt-2f7c4b4d2d2d4e0aa7c6ef379245a80e
   JWT_TTL_SECONDS=86400
   ```
3. **Run with Docker Compose** (no local Node/npm needed afterwards):  
   ```bash
   docker compose up -d --build
   ```
   - `postgres_data` volume keeps data between restarts.  
   - Containers use `restart: unless-stopped`, so they come back after host reboots. If you nuke volumes (`docker compose down -v`), you wipe the DB.
4. **Join waitlist or skip straight to admin provisioning**  
   ```bash
   curl -X POST http://localhost:8080/waitlist \
     -H 'content-type: application/json' \
     -d '{ "email": "founder@example.com", "name": "Ada" }'
   # or mint immediately
   curl -X POST http://localhost:8080/admin/projects \
     -H 'content-type: application/json' \
     -H 'x-voike-admin-token: voike-admin-5bb6c26f3a89441f8fbf95c7088795e4' \
     -d '{ "projectName":"demo","organizationName":"acme","keyLabel":"primary" }'
   ```
5. **Capture the API key** – Response includes `project.id` + `apiKey.key`. Supply that value as `X-VOIKE-API-Key` on every protected request (or set `VOIKE_API_KEY` env for scripts).
6. **Exercise the backend**  
   ```bash
   VOIKE_API_KEY=<key> VOIKE_BASE_URL=http://localhost:8080 npm run regression
   ```
   The regression script ingests a CSV, waits for `/ingest/{jobId}`, fires `/query`, and checks `/kernel/state` + `/ledger/recent`.
7. **Inspect telemetry**  
   - `curl -H "x-voike-api-key: <key>" http://localhost:8080/metrics`  
   - WebSocket `/events` (send the same header) to stream `ingest.*`, `query.*`, `kernel.energyUpdated`, `dai.updateSuggested`.
8. **Deploy/refresh on your edge server**  
   ```bash
   cd /root/voike
   git fetch origin
   git reset --hard origin/main
   docker compose down
   docker compose up -d --build
   ```
   Data remains intact because Postgres uses a named volume. If you need HA, run multiple VOIKE containers (voike1/voike2) behind a load balancer that points at a replicated Postgres (managed HA, Patroni, or Galera-compatible setup).

## API Surface & Docs
- `docs/api.md` – full endpoint breakdown, curl snippets, auth model.
- `docs/kernels.md` – kernel math + behavioral notes.
- `docs/openapi.yaml` – machine-readable schema for codegen.
- `GET /` – Tailwind landing page (embed in docs portals or show as-is).  
  `GET /info` – same payload in JSON for CLI/SDK.
- **Builder auth routes** – `/auth/check-whitelist`, `/auth/setup-password`, and `/auth/login` let approved waitlist entries self-serve. Authenticated builders can call `/user/profile`, `/user/organizations`, `/user/projects`, and `/user/projects/:id/api-keys` to run their own provisioning workflows without the admin token.

## Testing & Tooling
- `npm test` – Jest coverage for kernels, UIE, VDB, and end-to-end ingestion flow (uses a MockPool).
- `npm run regression` – Hits the live HTTP API (requires `VOIKE_API_KEY`).
- `npm run seed` – Quick ingestion of a CSV into the default playground project (runs migrations + ensures auth tables).
- CI tip: run `npm run lint` (aka `tsc --noEmit`) before building Docker to catch type drift.

## Kernel Primer (Why DAI Exists)
- **VASVELVOGVEG**: Scores candidate plans, gates risky options, logs decisions to the Truth Ledger, and bumps VAR energy.
- **VAR**: Virtual energy accumulator that feeds into throttling and provides health telemetry.
- **VARVQCQC**: Lightweight heuristics that annotate queries (`SELECT *` warnings, semanticText fallbacks). No black-box rewrites.
- **DAI**: Watches runtime metrics + Kernel9 hints to suggest cache TTL/index/cost adjustments per project. *It does not mutate SQL – it only updates advisory state and emits `dai.updateSuggested` events.*

## Operating Notes
- **CORS**: Enabled for all origins by default (Fastify CORS plugin). If a frontend can’t reach the API, double-check it sends `X-VOIKE-API-Key` and that the browser allows custom headers.
- **Admin portal expectations**: There is still no username/password flow for admins—protect `/waitlist`, `/admin/*`, etc., by collecting the admin token (from a vault or secure form) and placing it in `X-VOIKE-ADMIN-TOKEN`. Builder dashboards use the new JWT-based `/auth/*` + `/user/*` routes instead.
- **Playground experiences**: Create a dedicated “Playground” project/key and surface it in docs so people can try `/query` immediately without provisioning.
- **HA & resilience**: Docker Compose is single-node; to avoid a single edge outage, run multiple nodes (voike1, voike2, …) pointing to a shared HA Postgres. Use Cloudflare LB / Nginx / HAProxy so `voike.supremeuf.com` survives node loss. Docker itself isn’t clustered—tools like Nomad, Kubernetes, or Docker Swarm can keep multiple VOIKE containers alive while corosync/Patroni handle database replication.
- **Upgrades**: Follow the `git fetch && git reset --hard origin/main && docker compose up -d --build` flow. Postgres volume keeps Truth Ledger + ingestion data safe.

## Build Your Own Portal
Because this repo ships **only** the backend, any UI (marketing site, admin console, docs playground) is expected to call these APIs:
1. Public landing → embed `/` (or fetch `/info`).
2. Waitlist form → `POST /waitlist`.
3. Admin review console → `GET /admin/waitlist`, approve entries, mint orgs/projects/keys.
4. Project dashboard → show ingestion jobs, kernel state, ledger, metrics via the API key.

You can use Next.js, Start UI, or any static site generator. Just remember: for admin/provisioning, set the `X-VOIKE-ADMIN-TOKEN` header; for project APIs, use the project’s `X-VOIKE-API-Key`. CORS is already open, so browser-based tooling works out of the box.

## Troubleshooting
| Symptom | Fix |
| --- | --- |
| `{"message":"Route GET:/ not found"}` | You hit the backend before deploying this version. Redeploy so `/` serves the landing page. |
| `Cannot connect... CORS issue` | Ensure your frontend sends `X-VOIKE-API-Key` (and `content-type`), or test with curl/Postman to confirm. |
| Admin panel says `/admin/waitlist` missing | Endpoint exists – make sure the request includes the admin token header and you’re pointing at the correct domain/port. |
| `FST_ERR_PLUGIN_VERSION_MISMATCH` | Use Fastify v4-compatible plugins (already pinned). Remove globally installed Fastify types if they force v5. |
| Containers disappear after reboot | Compose services already use `restart: unless-stopped`. Run `docker compose up -d` once per boot if needed; never remove the named volume unless you intend to wipe data. |

With these pieces in place, VOIKE-X is ready for your external builder to craft marketing sites, admin portals, or SDKs while this repo remains a lean, production-grade backend engine.
