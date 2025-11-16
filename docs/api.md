# VOIKE-X API Guide

All endpoints are JSON unless noted. The backend is fully headless—no GUI—so every interaction flows through these APIs (or a CLI that wraps them). Machine-readable schemas live in `docs/openapi.yaml`.

## 0. Surface Overview
| Method | Path   | Auth | Purpose |
|--------|--------|------|---------|
| GET    | `/`    | none | Tailwind landing page with quickstart steps + header hints |
| GET    | `/info`| none | JSON metadata describing features and docs |
| GET    | `/health` | none | `{ status, db, kernel }` |

## 1. Authentication Model
- **Provisioning header**: `X-VOIKE-ADMIN-TOKEN` (value set via `ADMIN_TOKEN` env). Used for waitlist approvals + org/project/key management.
- **Project access header**: `X-VOIKE-API-Key`. Every ingestion/query/kernels call must include this header.
- **Workflow**:
  1. Collect emails via `POST /waitlist`.
  2. Admin reviews (`GET /admin/waitlist`) and approves entries (`POST /admin/waitlist/:id/approve`) → creates organization, project, API key.
  3. Users call the functional APIs with their project key.

### Admin Provisioning Endpoints
All require `X-VOIKE-ADMIN-TOKEN`.

| Method | Path | Body | Result |
|--------|------|------|--------|
| POST | `/admin/organizations` | `{ "name": "Acme", "slug": "acme" }` | Creates organization |
| GET  | `/admin/organizations` | – | List organizations |
| POST | `/admin/projects` | `{ "projectName":"demo","organizationId":"uuid","keyLabel":"primary" }` (or provide `"organizationName"` to auto-create org) | Creates project + initial API key |
| POST | `/admin/organizations/{orgId}/projects` | `{ "projectName":"analytics","keyLabel":"prod" }` | Add project to org |
| POST | `/admin/projects/{projectId}/api-keys` | `{ "label": "read-only" }` optional | Extra API key |
| GET  | `/admin/waitlist` | – | List waitlist entries |
| POST | `/admin/waitlist/{id}/approve` | `{ "organizationName": "...", "projectName": "...", "keyLabel": "..." }` optional | Approves entry, creates org/project/key, returns all details |

### Waitlist (Public)
`POST /waitlist`
```json
{
  "email": "founder@example.com",
  "name": "Ada"
}
```

## 2. Project APIs (requires `X-VOIKE-API-Key`)

### 2.1 Ingestion
- `POST /ingest/file` (multipart)
  - Fields: `file` (binary), optional `logicalName`, optional hints.
  - Response: `{ "jobId": "uuid", "table": "normalized_table" }`.
- `GET /ingest/{jobId}`
  - Returns job record (`status`, `summary`), scoped to the project owner.

### 2.2 Hybrid Query
`POST /query`
```json
{
  "kind": "hybrid",
  "sql": "SELECT * FROM scientists WHERE score > 90",
  "semanticText": "notable scientists",
  "filters": { "entity_type": "profile" }
}
```
Response includes corrected query, kernel plan, and rows:
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

### 2.3 Kernels & Ledger
- `GET /kernel/state` → `{ energy, dai, limits }` (per project).
- `GET /ledger/recent` → last N Truth Ledger entries for the project.
- `GET /ledger/{id}` → specific entry (404 if not in project scope).

### 2.4 MCP Tools
- `GET /mcp/tools` → tool metadata.
- `POST /mcp/execute`
```json
{
  "name": "db.query",
  "input": { "query": { "kind": "sql", "sql": "SELECT 1" } },
  "context": { "sessionId": "cli-demo" }
}
```
Returned value depends on tool handler; context automatically inherits `projectId` from the API key.

### 2.5 Telemetry & Events
- `GET /metrics` → JSON gauge snapshot.
- `GET /events` (WebSocket) → send `X-VOIKE-API-Key` header during handshake. Streams events such as:
  - `ingest.completed`
  - `query.executed`
  - `kernel.energyUpdated`
  - `dai.updateSuggested`
Each payload includes `projectId` to correlate multi-project streams.

## 3. Health & Info
- `GET /health` → basic status (DB timestamp + kernel energy).
- `GET /info` → JSON with service name, recommended headers, quick links, CLI instructions.

## 4. Example Curl Snippets
```bash
# Health check
curl https://voike.supremeuf.com/health

# Waitlist signup
curl -X POST https://voike.supremeuf.com/waitlist \
  -H 'content-type: application/json' \
  -d '{ "email": "founder@example.com" }'

# Mint project + key (admin)
curl -X POST https://voike.supremeuf.com/admin/projects \
  -H 'x-voike-admin-token: SUPER_SECRET' \
  -H 'content-type: application/json' \
  -d '{ "projectName":"demo","organizationName":"acme","keyLabel":"primary" }'

# Run SQL query
curl -X POST https://voike.supremeuf.com/query \
  -H 'x-voike-api-key: <PROJECT_KEY>' \
  -H 'content-type: application/json' \
  -d '{ "kind":"sql","sql":"SELECT 1" }'
```

## 5. Integration Notes
- All ingestion/jobs/ledger rows are partitioned by `project_id` in Postgres.
- MCP tools automatically log to the project’s Truth Ledger; VAR energy updates also scoped by project.
- Regression + Python scripts require env vars: `VOIKE_API_KEY` and optionally `VOIKE_BASE_URL`.
- The `/` landing page can be embedded via iframe or used as JSON if you prefer to render your own marketing site.

## 6. References
- `docs/openapi.yaml` – machine-readable schema and sample payloads.
- `docs/kernels.md` – VASVEL / VAR / VARVQCQC / DAI math notes.
- `README.md` – quickstart handbook, deployment tips, CLI usage.
