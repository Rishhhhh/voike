# VOIKE API Reference

Comprehensive REST and WebSocket endpoints for VOIKE deployments. Schemas live in `docs/openapi.yaml`; this guide summarizes high-level groups.

## REST Endpoint Families
- `/auth/*` – builder login, password setup, JWT issuance
- `/db/*` – query orchestration via SQL + hybrid endpoints
- `/vector/*` – bulk add/search/inference for embeddings
- `/ai/*` – higher-level agentic prompts with kernel routing
- `/ingest/*` – file, stream, and event ingestion APIs
- `/functions/*` – serverless invocation + management
- `/storage/*` – artifact/object handling
- `/streams/*` – event stream management, WebSocket bootstrap

## Headers
- `x-voike-api-key` – project-scoped auth (required for DB/vector/AI routes)
- `x-voike-admin-token` – provisioning + organization control plane
- `authorization: Bearer <jwt>` – builder console/API usage

## Response Patterns
- All responses include `meta.traceId` when kernels execute
- Errors follow `{ "error": { "code": "...", "message": "..." } }`
- Async operations return `{ jobId, statusUrl }`

## WebSocket Streams
- Connect to `/events` with `x-voike-api-key`
- Topics: `ingest.completed`, `query.executed`, `kernel.energyUpdated`, `cost.alert`, custom serverless events

## Tooling
- `docs/openapi.yaml` drives SDK generation and CLI auto-complete
- Regression scripts (`scripts/voike_regression.py`, `npm run regression`) exercise critical paths
