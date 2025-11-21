# VOIKE Agents Mega Whitepaper Add-On — Module 2

## Section 2 · Agent Classes

This module defines the full taxonomy of VOIKE Agents so Codex 5.1 can implement each class incrementally while maintaining compatibility with Module 1’s unified model.

### 2.0 Taxonomy Overview

VOIKE agents fall into eight primary classes. Each inherits the base schema (`agentId`, `class`, `capabilities`, `tools`, `memory`, `goalStack`, `state`, `metadata`) and extends it with class-specific responsibilities:

1. System Agents
2. Kernel Agents
3. Network Agents
4. Database Agents
5. File Agents
6. Security Agents
7. Developer Agents
8. User-Facing Agents

All classes evolve through DAI variables (autonomy level, inference depth, safety constraints, compute preference) and log to the ledger/capsule stack.

---

### 2.1 System Agents (OS-Level Intelligence)

**Purpose:** Manage VOIKE OS resources (CPU, GPU, RAM, storage), supervise system services, enforce power policies, and perform self-healing.

- **Capabilities:** `sys.read`, `sys.write`, `sys.monitor`, `sys.optimize`, `sys.recover`
- **Tools:** `fs.read`, `fs.write`, `kernel.signal`, `sys.resourceGraph`
- **Memory:** short-term telemetry vectors, long-term system state store
- **Goal patterns:** keep load < threshold, recover failed service, rebalance energy usage
- **Evolution:** high safety, medium autonomy; DAI raises inference depth under stress.

---

### 2.2 Kernel Agents (Kernel-8 + Kernel-9 Drivers)

**Kernel-8 Agent**
- deterministic scheduler, syscall auditor, trace recorder
- capabilities: `k8.schedule`, `k8.enforce`, `k8.trace`

**Kernel-9 Agent**
- variational optimizer (VEX), DAI curator, VARVQCQC orchestrator
- capabilities: `k9.optimize`, `k9.variationalRoute`, `k9.predictFailure`, `k9.recover`

**Behavior:** Kernel-8 enforces invariants; Kernel-9 bends routing weights for throughput/cost. Together they deliver hybrid deterministic/variational execution.

---

### 2.3 Network Agents (AI-Enhanced DNS & Routing)

**Purpose:** Replace static DNS with predictive, semantic routing across POPs.

- **Responsibilities:** DNS resolution, latency prediction, QUIC fallback, anti-failure rerouting, mesh health probes.
- **Capabilities:** `network.resolve`, `network.predictLatency`, `network.fallback`, `network.meshRoute`, `network.securityScan`, `network.repair`
- **Model:** `route = argmin(latency + error_prob + compute_cost + congestion)`
- **Evolution:** learns from POP metrics, outages, attack signatures; updates SNRL/VDNS tables automatically.

---

### 2.4 Database Agents (AI-Native VOIKE DB)

**Purpose:** Turn ingestion/query/indexing into intelligent, self-optimizing loops.

- **Capabilities:** `db.query`, `db.index.optimize`, `db.ingest`, `db.snapshot`, `db.clone`, `db.vectorize`, `db.schemaEvolve`
- **Workflows:** automatic query plan rewrites, index suggestions, schema evolution, TB-scale instant clone/fork, ledger-integrity checks.
- **Memory:** relational lineage + vector embeddings per table/capsule.
- **Evolution:** DAI variables steer caching/index building as workload changes.

---

### 2.5 File Agents (Omnichannel Ingestion)

**Purpose:** Detect file types, extract structure, transform formats, push to VOIKE DB + Knowledge Fabric.

- **Capabilities:** `file.detect`, `file.parse`, `file.extract`, `file.convert`, `file.vectorize`, `file.routeToDB`
- **Pipeline:** detect → parse → transform → validate → ingest → vectorize.
- **Formats:** CSV, JSON, YAML, Parquet, PKL, SQL dumps, Excel, custom adapters.
- **Evolution:** uses success/failure rates to refine heuristics per data source.

---

### 2.6 Security Agents (Zero-Trust Self-Defense)

**Purpose:** Guard OS, DB, POP mesh, APIs, and agent fabric.

- **Capabilities:** `sec.scan`, `sec.firewall`, `sec.trace`, `sec.reverse`, `sec.quarantine`, `sec.repair`
- **Behaviors:** anomaly detection, threat tracing, automatic patching, kill-switch containment, capsule rollback for compromised services.
- **Memory:** threat embeddings + ledgered incident history.
- **Evolution:** adapts to new attack patterns, raising safety constraints for other agents when risk increases.

---

### 2.7 Developer Agents (Autonomous Builders)

**Purpose:** Maintain VOIKE code, docs, SDKs, migrations, and tests.

- **Capabilities:** `dev.generate`, `dev.refactor`, `dev.test`, `dev.docs`, `dev.migrate`, `dev.analyze`
- **Lifecycle:** gather context → generate plan/code → simulate → produce patches or documentation → log to `/orchestrator/tasks`.
- **Integration:** consumes FLOW specs, VVM descriptors, repo files via `source.readFile`.
- **Evolution:** uses DAI metrics (acceptance rate, test pass rate) to adjust autonomy.

---

### 2.8 User-Facing Agents (API, Chat, Pipelines)

**Purpose:** Interface with user workloads—chat copilots, API relays, pipeline orchestrators.

- **Capabilities:** `api.call`, `pipeline.trigger`, `user.context`, `billing.check`
- **Memory:** per-project context vectors + relational user profile store.
- **Policies:** enforce per-project API keys, billing limits, data-access scopes.
- **Evolution:** calibrates tone, latency, and tool usage based on user history + telemetry.

---

## Implementation Guidance

- Each class is a logical extension of the base agent record introduced in Module 1. Codex should associate the `class` field with default capabilities, tool manifests, and DAI settings.
- Security boundaries: Agents must operate within capability manifests enforced by the API gateway and logged to the truth ledger (`/agents` + ledger events).
- Memory strategy: short-lived context in Kernel-9 encrypted buffers; capsule snapshots + ledger anchors for long-term reproducibility.

*Next module preview: Section 3 (Agent Runtime) detailing loops, supervisor/router worker models, sandboxing, scheduling, tool lifecycle, and hybrid memory maps.*
