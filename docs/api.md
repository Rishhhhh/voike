# VOIKE-X API Guide

Headless backend only—no GUI included. Every user flow (waitlist, provisioning, ingestion, query, MCP orchestration) is driven through the HTTP+WebSocket surface described here. Schemas for automation live in `docs/openapi.yaml`.

## 0. Landing + Discovery
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/` | none | Tailwind landing page with quickstart steps, headers, and curl-ready snippets |
| `GET` | `/info` | none | JSON metadata mirroring the landing page for programmatic use |
| `GET` | `/health` | none | `{ status, db, kernel }` quick probe |

The landing page lists whichever `PLAYGROUND_API_KEY` you configured. Use it for docs/testing or hide it by omitting the env var.

## 1. Authentication & Control Plane
- **Provisioning header**: `X-VOIKE-ADMIN-TOKEN` (value = `ADMIN_TOKEN`). Required for waitlist approvals plus organization/project/API-key management.
- **Project header**: `X-VOIKE-API-Key`. Every ingestion/query/kernels/telemetry route requires this key.
- **Playground key (optional)**: Set `PLAYGROUND_API_KEY` to auto-create a “Playground Project” and expose that key on `/` + `/info`. Great for public sandboxes, docs, or SDK defaults.

### Waitlist (public)
- `POST /waitlist`
```json
{
  "email": "founder@example.com",
  "name": "Ada"
}
```
Returns `{ "status": "pending", "entry": {...} }`. Duplicate emails just refresh the record.

### Admin endpoints (require `X-VOIKE-ADMIN-TOKEN`)
| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/admin/waitlist` | – | List pending/approved entries |
| `POST` | `/admin/waitlist/{id}/approve` | `{ "organizationName": "...", "projectName": "...", "keyLabel": "..." }` optional | Provisions organization → project → API key, updates entry |
| `GET` | `/admin/organizations` | – | List organizations |
| `POST` | `/admin/organizations` | `{ "name": "Acme", "slug": "acme" }` | Create organization |
| `POST` | `/admin/projects` | `{ "projectName":"demo","organizationId":"uuid" }` or include `"organizationName"` to auto-create | Create project + API key |
| `POST` | `/admin/organizations/{orgId}/projects` | `{ "projectName":"analytics","keyLabel":"prod" }` | Add project+key inside org |
| `POST` | `/admin/projects/{projectId}/api-keys` | `{ "label":"read-only" }` optional | Adds additional key for same project |

Approving a waitlist entry does **not** auto-set a password. The backend provisions the organization → project → API key tuple and marks the related `users` row as approved. Builders then call `/auth/check-whitelist` → `/auth/setup-password` to finalize their login before using `/user/*`.

### Builder auth & self-service (JWT bearer)
Once approved, a waitlist entry becomes a `users` row. Builders set a password once, then authenticate with `Authorization: Bearer <token>`:

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `POST` | `/auth/check-whitelist` | `{ "email": "founder@example.com" }` | Returns status + whether password is set |
| `POST` | `/auth/setup-password` | `{ "email": "founder@example.com", "password": "..." }` | First-time password creation (approved entries only) |
| `POST` | `/auth/login` | `{ "email": "...", "password": "..." }` | Issues JWT (`expiresIn = JWT_TTL_SECONDS`) |
| `GET` | `/user/profile` | – | Returns user info + owned orgs/projects |
| `GET` | `/user/organizations` | – | List organizations owned by the builder |
| `GET` | `/user/projects` | – | List builder-owned projects |
| `POST` | `/user/projects` | `{ "projectName": "...", "organizationId?": "...", "organizationName?": "...", "keyLabel?": "..." }` | Create project + API key inside builder-owned org |
| `POST` | `/user/projects/{id}/api-keys` | `{ "label":"staging" }` optional | Mint additional keys for a builder-owned project |

## 2. Project APIs (require `X-VOIKE-API-Key`)

### 2.1 Ingestion
- `POST /ingest/file` (multipart):
  - Fields: `file` (binary), optional `logicalName`.
  - Response: `{ "jobId": "uuid", "table": "normalized_table" }`.
- `GET /ingest/{jobId}` → Job row with `status`, `summary` (project scoped).

### 2.2 Query
`POST /query`
```json
{
  "kind": "hybrid",
  "sql": "SELECT * FROM scientists WHERE score > 90",
  "semanticText": "notable scientists",
  "filters": { "entity_type": "profile" }
}
```
Response:
```json
{
  "rows": [...],
  "meta": {
    "engine": "hybrid",
    "latencyMs": 12,
    "correctedQuery": { ... },
    "kernelTraceId": "vector-engine"
  }
}
```
Pipeline: VARVQCQC corrects query → VASVEL chooses plan → VDB executes → ledger entry + DAI update recorded per project.

### 2.3 Kernel & Ledger
- `GET /kernel/state` → `{ energy, dai, limits }` for the calling project.
- `GET /ledger/recent` → 20 most recent Truth Ledger entries (per project).
- `GET /ledger/{id}` → A specific ledger entry if it belongs to that project.

### 2.4 MCP Tools
- `GET /mcp/tools` → list of registered tools (metadata only).
- `POST /mcp/execute`
```json
{
  "name": "db.query",
  "input": { "query": { "kind": "sql", "sql": "SELECT 1" } },
  "context": { "sessionId": "cli-demo" }
}
```
Context automatically injects `projectId` from the API key so kernels/logging remain scoped.

### 2.5 Metrics & Events
- `GET /metrics` → JSON gauge snapshot (latency, counters, kernel energy, ingestion counts, etc.).
- `GET /events` (WebSocket) → connect with `X-VOIKE-API-Key` header; streams:
  - `ingest.completed`
  - `query.executed`
  - `kernel.energyUpdated`
  - `dai.updateSuggested`
Each payload contains `projectId` so you can multiplex multiple projects from one listener if needed.

## 3. Health & Info
- `GET /health` → simple check verifying DB connectivity + VAR energy.
- `GET /info` → JSON version of the landing page, including quickstart steps, endpoint groups, and three ready-to-run curl snippets.

## 4. Curl Cheatsheet
```bash
# Waitlist signup
curl -X POST https://voike.supremeuf.com/waitlist \
  -H 'content-type: application/json' \
  -d '{ "email": "founder@example.com" }'

# Approve and mint project/key
curl -X POST https://voike.supremeuf.com/admin/waitlist/<WAITLIST_ID>/approve \
  -H 'x-voike-admin-token: SUPER_SECRET' \
  -H 'content-type: application/json' \
  -d '{ "organizationName":"Ada Labs", "projectName":"vector-api", "keyLabel":"primary" }'

# Hybrid query
curl -X POST https://voike.supremeuf.com/query \
  -H 'x-voike-api-key: <PROJECT_KEY>' \
  -H 'content-type: application/json' \
  -d '{ "kind":"hybrid","sql":"SELECT * FROM scientists WHERE score > 95","semanticText":"legendary scientist" }'
```

## 5. Integration Notes
- Control tables (`organizations`, `projects`, `api_keys`, `waitlist`) sit beside VDB tables inside Postgres; everything is transactional.
- Ingestion jobs, Truth Ledger entries, VAR energy, DAI states, telemetry events, and MCP traces are **all tagged with `project_id`**.
- Scripts & SDKs should read `VOIKE_API_KEY` (and optionally `VOIKE_BASE_URL`) from env. The included `npm run regression` script already expects this.
- `/` can be embedded in your marketing site or mirrored inside a dashboard; `/info` provides the same details for any CLI/SDK usage.

## 6. References
- `README.md` – deployment + Quickstart handbook.
- `docs/kernels.md` – kernel math notes.
- `docs/openapi.yaml` – structured schema for codegen.
