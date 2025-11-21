# VOIKE Agents Mega Whitepaper Add-On — Module 8

## Section 8 · Agentic Hybrid Querying & Reasoning Layer (AHQ-RL)

Module 8 is the reasoning layer on top of Modules 5–7. It translates natural
language or mixed SQL/vector intents into cost-aware execution plans, runs them
across relational/vector/graph stores, fuses the results, and caches everything
so VOIKE stays fast even when serving complex questions.

### 8.0 Capabilities delivered
- **Hybrid Query Service (`src/hybrid/queryService.ts`)** – Query Parsing Agent +
  plan/result caches + profiler. Handles SQL, vector, graph, and NL intents.
- **Extended VDB** – `VDBQuery.kind` now includes `graph`; `queryGraph` exposes
  the `graph_edges` table.
- **APIs** – `POST /hybrid/query`, `GET /hybrid/plans`, `/hybrid/cache`,
  `/hybrid/profiles` let agents/humans inspect plans, cache hits, and latency.
- **FLOW** – `flows/hybrid-query.flow` shows the detect → plan → execute → fuse
  pipeline so FLOW/AgentOps can orchestrate hybrid reasoning in CI/agents.
- **Docs** – README §§6.9 & 15 outline the architecture, compare to Antigravity,
  Supabase, TigerData, and point to safe optimization rules.

### 8.1 Plan lifecycle
1. **Request normalization** (SQL/vector/graph/NL) → heuristics for quick
   detection of best mode (vector vs SQL vs graph vs hybrid).
2. **Plan synthesis** – steps recorded (vector search, SQL sample, fusion).
3. **Execution** – sequentially run each step; results fused with ranking/cutoff.
4. **Caching** – plan + result caches (TTL=30s) slash latency for repeated queries.
5. **Profiling** – every execution stored in `hybrid_query_metrics` table and an
   in-memory ring buffer for dashboards.

### 8.2 Agent roles
- **Query Parsing Agent (QPA)** – heuristics + NL cues determine query type.
- **Kernel-9 Optimizer** – represented by cost estimates + plan caching; perfect
  hook for future Kernel-9 heuristics.
- **Execution Agent** – ties into VDB (SQL/vector/graph) + handles backpressure.
- **Result Fusion Agent** – merges relational rows + vector hits; dedup + limit.
- **Monitoring Agent** – surfaces `/hybrid/profiles` for dashboards + Module 5 UI.

### 8.3 Competitive analysis snapshot
| Feature | VOIKE Module 8 | Google Antigravity | Supabase | TigerData |
| --- | --- | --- | --- | --- |
| Multi-store hybrid | ✅ SQL + vector + graph | ❌ (IDE) | ❌ | ❌ |
| NL → Query | ✅ (agentic) | ✅ (IDE NL) | ❌ | ❌ |
| Token efficiency | ✅ heuristics first | ❌ heavy Gemini | ❌ | ❌ |
| Caching/profiles | ✅ | ❌ | Partial | ❌ |
| Security lineage | ✅ inherits Module 6–7 | ❌ preview | ✅ | ✅ |

### 8.4 Roadmap
- ✅ Hybrid service + APIs + basic caching.
- 🔜 Kernel-9 cost model integration & dynamic reordering.
- 🔜 Vector/graph fusion scoring heuristics exposed to FLOW/agents.
- 🔜 Natural language disambiguation via Module 5 LLM sandbox.

Module 8 finalizes the data plane: ingest anything (Module 7), secure it (Module
6), run it everywhere (Module 5), and **query it intelligently** through
agentic hybrid reasoning.
