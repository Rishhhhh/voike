# VOIKE-X API Guide

## Health & Info
- `GET /health` → `{ status, db, kernel }`
- `GET /info` → build metadata & feature toggles.

## Ingestion
### POST /ingest/file
Multipart fields:
- `file` (binary)
- `logicalName` (optional)

Response:
```json
{
  "jobId": "uuid",
  "table": "scientists"
}
```
Retrieve status with `GET /ingest/{jobId}`.

## Query
### POST /query
Request body follows `VDBQuery` schema:
```json
{
  "kind": "hybrid",
  "sql": "SELECT * FROM scientists WHERE score > 90",
  "semanticText": "notable scientists",
  "filters": { "entity_type": "profile" }
}
```
Response includes corrected query + kernel trace metadata:
```json
{
  "rows": [...],
  "meta": {
    "engine": "hybrid",
    "latencyMs": 12,
    "correctedQuery": { ... },
    "kernelTraceId": "hybrid-engine"
  }
}
```

## Kernel & Ledger
- `GET /kernel/state` → VAR energy, DAI config, query limits.
- `GET /ledger/recent` → latest Truth Ledger entries.
- `GET /ledger/{id}` → specific record.

## MCP Tools
- `GET /mcp/tools` → registry listing.
- `POST /mcp/execute`
```json
{
  "name": "db.query",
  "input": {
    "query": { "kind": "sql", "sql": "SELECT 1" }
  },
  "context": { "sessionId": "demo" }
}
```

## Events & Metrics
- `GET /events` (WebSocket) → `ingest.completed`, `query.executed`, `kernel.energyUpdated`, `dai.updateSuggested`.
- `GET /metrics` → gauge snapshot (latency, counters, etc.).

Refer to `docs/openapi.yaml` for machine-readable schemas.
