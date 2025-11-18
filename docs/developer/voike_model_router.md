# VOIKE Model Router

## Responsibilities
- Auto-select LLM or deterministic kernel stack per query
- Route workloads to Kernel-8, Kernel-9, or specialized adapters (vision, audio)
- Honor cost governor policies and latency budgets

## Inputs Considered
- `query.kind` (sql, vector, hybrid, ai)
- Table modality metadata (structured, embeddings, graph)
- Project policy: `preferredModels`, `maxCost`, compliance tags
- Real-time kernel telemetry (energy, queue depth)

## Workflow
1. Normalize request context (user, project, session)
2. Score candidate models with heuristics + learned signals
3. Pick primary executor plus optional verifier/critic
4. Emit routing decision to metrics + ledger for debugging

## Configuration
- `router.yaml` per deployment defines priority order
- Override per request via `route_hint` or `force_model`
- Integrates with `voike_cost_governor.md` for throttling decisions
