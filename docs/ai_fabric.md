# AI Fabric & Knowledge Atlas

VOIKE AI Fabric passively analyzes ingests, queries, blobs, jobs, and ledger events to build a **Knowledge Atlas** per project. These events land in the **Project Knowledge Fabric**:

- `ai_knowledge_nodes` captures summaries for every ingest/query/blob/job/ledger entry.
- `ai_data_policies` controls how much detail AI Q&A endpoints can share (`none`, `metadata`, `summaries`, `full`).
- Knowledge nodes are automatically populated via telemetry (ingest completed, query executed, blob created, grid job submitted, ledger appended).

## Concepts
- `ai_atlas_entities` – discovered tables/blobs/entities/topics with summaries + metadata.
- `ai_runs` – background AI jobs (ingest analysis, query explainers, blob annotations).
- `ai_knowledge_nodes` – Knowledge Fabric entries used by `/ai/ask`.
- `ai_data_policies` – per-project policy for how `/ai/ask` responds.
- AI jobs run asynchronously; they never block the hot path.

## APIs
- `GET /ai/status` (project API key) – recent AI jobs and their status.
- `GET /ai/atlas` (project API key) – list of discovered entities (tables, blobs, topics) for this project.
- `GET /ai/atlas/table/:table` – detail view for one table/entity (summary, metadata, last updated).
- `POST /ai/query/explain` – provide `{ sql, semanticText?, filters? }` to get a human-readable explanation.
- `POST /ai/query/summarize-result` – send sampled rows to receive statistics (row count, min/max/avg, top categorical values).
- `GET /ai/ops/triage` – AI summary of current SLOs + open advisories; highlights any breaches.
- `GET /ai/suggestions` – backlog of suggestions (indexes, HyperFlows, capsule ideas) created automatically per project.
- `POST /ai/suggestions/{id}/approve` / `.../reject` – change suggestion status; actions are logged to the Truth Ledger via existing ops flows.
- `POST /ai/irx/learn` – recompute IRX weights from live objects so utility/locality/resilience pressure is tuned per project (IRX math stays deterministic; these are advisory multipliers).
- `GET /ai/irx/weights` – inspect the current weights the AI believes each project should lean on.
- `GET /ai/irx/heatmap` – view a ranked list of objects (`hot/warm/cold`) with weighted scores and metadata hints.
- `POST /ai/pipelines/analyze` – detect repeated Grid/VVM job patterns and surface pipeline proposals (recommended `vvm.yaml` snippets + HyperFlow graphs). Each proposal is logged as a `pipeline` suggestion so builders/agents can approve/apply.
- `POST /ai/capsule/summary` – narrate the delta between two capsules (tables, blobs, code refs, VVM artifacts) so you can confidently roll back or promote a change.
- `GET /ai/capsule/timeline` – chronological story showing each capsule snapshot, counts, and descriptions – think Git history but for the entire VOIKE universe.
- `GET /ai/policy` / `POST /ai/policy` – inspect or update the Knowledge Fabric access mode (default `summaries`).
- `POST /ai/ask` – project-scoped question answering that synthesizes the knowledge nodes and responds according to the current policy.

Future phases will add:
- Blob annotations (`ai.blobs.analyze`, `ai.blobs.search`).
- Capsule historian (`ai.capsule.summary`, `ai.capsule.timeline`).
- Governor assist (`ai.ops.plan`, autopilot approvals).

## Safety
- All AI operations are scoped to the same `X-VOIKE-API-Key` as the rest of VOIKE.
- AI results are read-only suggestions/annotations; changes still go through standard APIs.
- Project policies (`ai_data_policy`) can disable or restrict AI visibility per tenant.
