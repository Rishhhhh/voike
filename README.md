# VOIKE-X Backend

VOIKE-X is a kernel-aware, MCP-native backend that fuses hybrid database engines, deterministic + adaptive kernels, and a universal ingestion pipeline. There is no GUI; everything is exposed through HTTP APIs, optional WebSocket events, and MCP tools.

```
Clients -> API Layer -> MCP Orchestration -> Kernels -> VDB -> Postgres
             |                |               |         |
             |                |               |         +-> Truth Ledger / VAR energy
             |                |               +-> Kernel-8/9 + Semantic Ops
             |                +-> Tool registry / contexts / events
             +-> UIE -> Schema Synth -> Engine selection -> Indexing
```

## Features
- Hybrid VDB spanning SQL, document, vector, KV, graph, and time-series tables.
- Kernel-8 deterministic hints + Kernel-9 adaptive intelligence with Developmental AI growth loops.
- Semantic kernel implementations (VASVELVOGVEG, VAR, VARVQCQC, DAI) with Truth Ledger logging.
- Universal Ingestion Engine with format detection, schema synthesis, and engine selection.
- MCP tool registry covering DB, ingestion, and kernel utilities.
- Structured telemetry, metrics endpoint, and optional WebSocket event stream.

## Getting Started

### Prerequisites
- Node.js 18+
- Postgres 15+ with the `vector` extension (pgvector)

### Install
```bash
npm install
```

### Local Development
1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Run migrations + dev server:
   ```bash
   npm run dev
   ```
3. In another terminal, you can seed sample data:
   ```bash
   npm run seed
   ```

### Docker
Build and run with Docker Compose (includes Postgres):
```bash
docker compose up --build
```
The API listens on `http://localhost:8080`.

### Key Scripts
- `npm run dev` – Fastify server with hot reload.
- `npm run build` – Compile TypeScript to `dist/`.
- `npm test` – Run Jest suite (kernels, UIE, VDB, ingestion flow).
- `npm run seed` – Ingests a sample CSV via the UIE pipeline.

## API Highlights
- `GET /health` – status, DB clock, kernel energy.
- `POST /ingest/file` – multipart upload, triggers UIE pipeline.
- `GET /ingest/:jobId` – ingestion job status + summary.
- `POST /query` – accepts `VDBQuery`, routes through VARVQCQC + VASVEL.
- `GET /kernel/state` – hyperparameters, VAR energy, DAI state.
- `GET /ledger/*` – inspect Truth Ledger entries.
- `GET /mcp/tools` / `POST /mcp/execute` – MCP registry access.
- `GET /metrics` – JSON snapshot of gauges/counters.
- `GET /events` (optional WebSocket) – ingest/query/kernel events.

Detailed payloads and examples live in `docs/api.md` and `docs/openapi.yaml`.

## Architecture Notes
- **API Layer**: Fastify + Zod validation, WebSocket events, telemetry counters.
- **MCP Layer**: Tool registry bridging DB, ingestion, kernels, and growth state operations.
- **VDB Layer**: Postgres pool with vector/doc/graph helpers and hybrid query orchestration.
- **Kernels**: VASVEL (semantic gating), VAR (energy), VARVQCQC (query correction), DAI (growth loop) with tests.
- **UIE**: Format detection, parser modules (JSON/CSV/XLSX/Parquet/SQL/log/PDF/binary), schema synthesis, and engine selection heuristics.
- **Telemetry/Ops**: Pino logging, metric collector, Truth Ledger persistence.

## Deployment
- Configure environment via `DATABASE_URL`, `PORT`, and kernel hyperparameters (`KERNEL_ALPHA`, etc.).
- Use Docker Compose or your platform of choice to run `docker-compose.yml`.
- Lovable.dev compatible: point `DATABASE_URL` to the managed Postgres instance and deploy with `npm run build && npm start`.

## Next Steps
- Extend MCP tools for remote edge functions.
- Add CLI client or UI that consumes `/query` + `/events`.
- Layer in auth/tenant boundaries around contexts.

Refer to `docs/kernels.md` for mathematical grounding and to `docs/api.md` for interaction recipes.
