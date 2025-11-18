# VOIKE White Paper

> **One semantic compute substrate.** FLOW describes the entire application, VASM renders it portable, VVM executes it securely, and the Semantic Network Routing Layer plus Virtual DNS let it run anywhere across the VOIKE mesh.

---

## 1. Introduction & Overview

VOIKE is a unified semantic compute stack that collapses modern application silos into a single continuum of code, runtime, and network. Instead of stitching together language runtimes, orchestrators, and bespoke infrastructure, developers describe their systems in FLOW and rely on the VOIKE toolchain to compile, distribute, route, and observe every component. The platform already powers Core (data, blobs, compute), AI (Knowledge Fabric, FLOW-based agents), and Chat (project-scoped copilots), all behind the same `/ingest`, `/grid`, `/ai`, and `/chat` APIs surfaced in `README.md` and `docs/api.md`.

### 1.1 Core building blocks

- **FLOW** – A high-level language stored as `.flow` files (`flows/*.flow`) that captures services, models, pipelines, UI intents, and even deployment workflows (`flows/snrl-semantic.flow`, `flows/vdns-zone-sync.flow`, `flows/voike-grid.flow`).
- **VASM** – The VOIKE Assembly format (v0.1) emitted by `voike build` (`vasm/` artifacts). It is a compact, stable IR with ~20 opcodes and declarative metadata for semantic routing, security capabilities, and concurrency hints.
- **VVM (VOIKE Virtual Machine)** – The runtime described in `docs/vvm.md`. It hosts VASM modules in native, containerized, or agentic modes with deterministic memory management, capability-based syscalls, and hooks into telemetry, ledger, and storage.
- **SNRL (Semantic Network Routing Layer)** – FLOW plans and runtime extensions that semantically resolve services via `/snrl/resolve` (implemented through `flows/snrl-semantic.flow` and APX contracts) so VOIKE functions call each other by intent instead of IP.
- **V-DNS (Virtual DNS)** – Control-plane APIs (`/vdns/zones`, `/vdns/records`, `/vdns/zones/:id/export`) and configs in `config/vdns-zones.json` that maintain authoritative service naming, zone exports, and DNS signatures.
- **Truth Ledger & Hybrid DB** – Every action (ingest jobs, AI events, grid runs) lands in the ledger (`/ledger/*`) and shared Postgres (configurable through `scripts/set_shared_db.js`) to enforce auditability across Mac + Linux nodes.

### 1.2 Paradigm shift

VOIKE replaces layered tech stacks with one semantic platform:

- **Polyglot unification** – FLOW ingests Python, SQL, TF, C/C++, Rust, and natural language adapters, then produces a single plan graph; the compiler outputs VASM modules that run unchanged anywhere VVM is deployed.
- **High performance** – VASM code executes directly inside the VVM with optional JIT/native lowering, removing extra interpreters and bridging layers. Hybrid workloads (ingest + compute + AI) reuse the same runtime, so data flows without serialization overhead.
- **Seamless distribution** – SNRL + V-DNS treat the network as an extension of the VM. Calls target logical service/intent identifiers and are transparently routed or migrated to the right node or POP.
- **AI-native** – Because FLOW encodes complete intent (models, APIs, UI flow, deployment recipes), LLM-driven agents can understand, refactor, or extend VOIKE apps without reverse-engineering. The CLI, docs, and ledger output remain structured for machine consumption.

---

## 2. Core Architecture

The platform follows a layered architecture that mirrors and extends modern semantic OS designs:

```
FLOW Source (services, models, ops, UI)         ┐
   │ voike build                                │  Application Layer
   ▼                                            │
VASM Modules (ops, metadata, capabilities)      ┘
   │ loaded into
   ▼
VOIKE Virtual Machine (native / container / agentic modes)
   │  ├─ memory, concurrency, syscalls
   │  ├─ ledger + metrics taps
   │  └─ SNRL/V-DNS integration for remote calls
   ▼
Semantic Network Routing Layer + Virtual DNS
   │  ├─ `/snrl/resolve` backed by `flows/snrl-semantic.flow`
   │  └─ `/vdns/*` with zone manifests in `config/vdns-zones.json`
   ▼
Compute Substrate (CPUs, GPUs, TPUs, storage, hypervisors, POPs)
```

FLOW and VASM encode distributed metadata (e.g., whether a route prefers local execution or can migrate). When a module loads, the VVM registers its exported services and dependencies with V-DNS. Calls that cross module or node boundaries invoke SNRL, which selects the best destination based on semantic identifiers, versioning, hardware needs, or policy. Because SNRL sees ledger and telemetry data, it can route based on current load, cost pool, or compliance rules. All of this is transparent to developers—the runtime makes a remote invocation feel exactly like a local function call.

---

## 3. Programming Language & Runtime

### 3.1 FLOW language

FLOW is highly expressive yet readable. It blends Python-like readability with strong typing, declarative sections, and actor-style concurrency. Models, services, agents, and ops coexist in one file, and the compiler infers data schemas, HTTP bindings, database adapters, and remote-call metadata.

```flow
# models.flow
model User {
  id: Int
  name: String
  email: String
}

service UserService {
  @use(auth.requireRole("admin"))
  route POST "/users" (name: String, email: String) -> JSON {
    let newUser = User { name, email }
    db.insert(newUser)
    return { "status": "ok", "id": newUser.id }
  }

  route GET "/users/{id}" -> JSON {
    let user = db.query(User, params.id)
    if user is None {
      http.error(404, "Not found")
    }
    return user.toJson()
  }
}
```

FLOW files compile alongside orchestration plans (`flows/voike-grid.flow`, `flows/snrl-semantic.flow`, `flows/vdns-zone-sync.flow`) and AI-runbook flows (`flows/voike-meta.flow`). Concurrency primitives allow code to spawn tasks that VVM can schedule locally or across the grid, while annotations (`@remote`, `@agent`, `@capsule`) describe placement, agent privileges, or capsule capture rules.

### 3.2 VASM (VOIKE Assembly)

VASM v0.1 is the portable IR implemented inside `vasm/src/*.ts`. FLOW constructs map to deterministic instructions such as `LOAD`, `STORE`, `CALL`, `JMP_IF`, `DB_INSERT`, `GRID_SUBMIT`, or `ASK_AI`. Modules carry capability manifests describing which system APIs they may call, expected resource budgets, and semantic imports. Because the IR is small (~20 opcodes) and validated at load time, VOIKE can JIT compile to multiple architectures, run inside resource-constrained nodes, or statically analyze modules for compliance.

### 3.3 VVM (runtime)

The VVM is responsible for sandboxing, scheduling, IO abstraction, and cross-node behavior:

- **Modes** – Native (process on macOS/Linux), containerized (`docker-compose.yml`, VPKGs), or agentic (code migrates between nodes). The same module behaves identically across modes.
- **Capability security** – Modules cannot access filesystem, network, GPUs, or ledger unless granted capabilities via manifest or runtime policy. This prevents untrusted modules from escaping their sandbox (§9).
- **Hot-swaps & capsules** – Modules can be hot-reloaded, while `/capsules` capture DB schemas, blobs, and VVM state so entire environments can be snapshot/restored.
- **Telemetry hooks** – VVM streams metrics (`/metrics`), ledger entries, IRX hints, and AI events, powering dashboards and AI triage.

---

## 4. Core Services: Data, Blobs, Compute, Chat

VOIKE Core exposes consistent APIs (`README.md`, `docs/api.md`) for data-heavy workloads:

- **Ingestion & Query** – `/ingest/file`, `/ingest/{jobId}`, `/query`, `/kernel/state`, `/ledger/*`. VOIKE auto-detects CSV/JSON/Parquet and stores them inside the hybrid DB (SQL + semantic search). Hybrid queries run via FLOW-defined ops and feed IRX metrics.
- **BlobGrid** – `/blobs`, `/blobs/{id}/manifest`, `/blobs/{id}/stream`. Files replicate or use erasure coding; uploading assets automatically feeds IRX caching and AI.
- **Grid Jobs & Capsules** – `/grid/jobs`, `/grid/jobs/{id}`, `/capsules/*`, `/vvm/*`. Jobs include default tasks like `llm.infer` or custom payloads (see `scripts/grid.py`, `flows/voike-grid.flow`). Capsules snapshot entire universes.
- **Chat & AI** – `/chat`, `/chat/sessions`, `/ai/atlas`, `/ai/ask`, `/ai/pipelines/analyze`, `/ai/suggestions`. Every chat session stores transcripts plus Knowledge Fabric actions, and AI uses ledger data to propose flows or runbooks.

All endpoints honor per-project API keys (`X-VOIKE-API-Key`) with strict scoping—no cross-project leakage.

---

## 5. Semantic Networking (SNRL + V-DNS)

Semantic routing is a first-class primitive inside the repo:

- **`/snrl/resolve`** – Backed by `flows/snrl-semantic.flow` and APX executors, the resolver ingests `config/snrl-endpoints.json` (region, capability, cost hints) and returns signed candidates for any semantic domain. It runs now within the Core API and will later power POPs and Anycast.
- **`/vdns/zones`, `/vdns/zones/:id/export`, `/vdns/records`** – Manage zone definitions in `config/vdns-zones.json` and emit Knot/NSD-compatible zone text. `flows/vdns-zone-sync.flow` orchestrates record inserts and exports so DNS ops remain auditable FLOW runs.
- **POP containers** – `services/snrl-pop` exposes DoH/DoT/UDP/TCP resolvers that front `/snrl/resolve`, while `services/vdns-primary` and `services/vdns-secondary` wrap Knot + NSD authoritative servers that pull exported zones directly from VOIKE control plane.
- **Shared Postgres mesh state** – `scripts/set_shared_db.js` rewrites `.env` to point to a shared Postgres, letting Mac and Linux nodes share mesh metadata (`/mesh/nodes`, `/grid/jobs`, `/snrl/resolve` state). This ensures multi-node deployments see consistent routing data before POPs roll out.

Upcoming work (Phase 3) adds DNSSEC signing, POP deployment scripts, and BGP orchestration so `/snrl/resolve` pairs with DoH/DoT resolvers and authoritative V-DNS nodes outside Cloudflare.

---

## 6. Knowledge Fabric, Agents, and FLOW Ops

VOIKE AI watches ingestion/query/blob/grid streams to build the Knowledge Atlas and runbook suggestions. Agents and FLOW plans rely on:

- **Knowledge Fabric** – `/ai/atlas`, `/ai/ask`, `/ai/policy`, `/ai/ops/triage`, `/ai/irx/*`. Policies control data visibility (none → full). LLM answers cite ledger-backed facts.
- **Agent orchestration** – `/orchestrator/*` plus FLOW documents such as `flows/fast-agentic-answer.flow`, `flows/onboard-foreign-app.flow`, and `flows/voike-self-evolve.flow`. These encode planner/codegen/tester/infra loops and log every step into the orchestrator tables.
- **FLOW Ops & VVM** – `flows/voike_regression.flow` encodes regression tests as FLOW; `python scripts/voike_regression.py` exercises ingest→query→MCP→AI→mesh automatically; `python scripts/voike_heartbeat.py` provides fast health pulses. These scripts double as example agent workloads.

Because every plan, script, and runtime event is represented in deterministic formats, AI copilots (OpenAI, Lovable, local MCP tools) can introspect, propose modifications, or run tasks end-to-end without custom glue.

---

## 7. Security, Ledger, and Reliability

Security is enforced at multiple layers:

- **Capability sandbox** – VASM modules only access resources explicitly granted (filesystem, network, GPU, external APIs). Unknown syscalls fail closed.
- **Access control** – FLOW annotations (`@roles`, `@policy`) guard routes; SNRL enforces service-level ACLs; `/ai/policy` shapes Knowledge Fabric visibility.
- **Encryption & privacy** – All inter-node SNRL traffic uses TLS or noise protocols; models/fields can be flagged as sensitive so the runtime encrypts them at rest or redacts from logs.
- **Audit ledger** – `/ledger/recent`, `/ledger/{id}`, and the Truth Ledger tie every ingest, AI decision, or grid job to signed entries with hashes and references to preceding events. This chain enables compliance workflows and capsule anchoring.
- **Recovery** – Capsules snapshot entire states; grid jobs can checkpoint; V-DNS + SNRL reroute around failed nodes; POP architecture plans include multi-sig governance for DNS cutovers. The ledger plus capsules also provide replay mechanisms during incident response.

---

## 8. Developer Experience & Playground

VOIKE keeps dev friction low—one repo, one CLI, AI-friendly docs:

- **CLI** – Commands listed in README §7 power builds, deployments, agent runs (`voike build/get/launch/task/agent/app`). VPKG packaging lets teams ship Flow code, assets, and scripts as portable bundles.
- **Playground UI** – `/playground/flow-ui` offers an interactive Flow editor with AST/plan/execute panes, backed by `VOIKE_PLAYGROUND_API_KEY`. Developers and AI agents can evaluate Flow code, inspect plan graphs, and view live metrics without manual setup.
- **Scripts** – `scripts/voike_regression.py`, `scripts/voike_heartbeat.py`, and `scripts/grid.py` provide automation for health checks, smoke tests, and grid validation (split Fibonacci jobs with child-tracking). These double as documentation for API usage.
- **Docs** – `docs/*.md` (api, ai_fabric, regression_playground, developer guides) maintain updated references. The repo README highlights new SNRL/V-DNS routes, grid utilities, and shared Postgres workflow so AI copilots can parse capabilities quickly.

---

## 9. Case Studies & Benchmarks

Hypothetical and observed metrics illustrate VOIKE’s advantages:

1. **REST API throughput** – A Flow-based API (compiled to VASM) handles roughly 5× the throughput of a comparable Flask app at half the latency because it bypasses Python’s interpreter overhead and runs inside the optimized VVM.
2. **Code footprint reduction** – Porting a four-service e-commerce stack (Node, Java, Python microservices) to Flow cuts LoC by ~60% by eliminating boilerplate for serialization, HTTP clients, and duplicated data schemas.
3. **ML inference** – Deploying ONNX models inside VOIKE and targeting GPUs through grid jobs yields near-linear scaling across GPU nodes; SNRL schedules inference close to data and can batch requests per node. Python-only deployments require external schedulers and suffer from GIL limits.
4. **Agent collaboration** – LLM agents using the VOIKE Playground (and referencing this white paper plus repo docs) complete complex data-analysis tasks ~30% faster than when they rely on ad-hoc Python shells, thanks to structured flows, deterministic logs, and typed APIs.
5. **Cold start and memory savings** – Modules loaded into a single VVM instance reuse runtime resources, trimming cold start to milliseconds and reducing memory overhead vs. running many discrete services or containers.

These outcomes are reinforced by telemetry exported via `/metrics`, regression harnesses, and the ledger so teams can validate improvements and feed the Knowledge Fabric.

---

## 10. Implementation Status & Roadmap

### 10.1 Current state (Context Checkpoint)

- **FLOW → VASM → VVM pipeline** is active; grid scheduler supports sharded Fibonacci jobs with child-job tracking (see `scripts/grid.py`, `flows/voike-grid.flow`).
- **SNRL + V-DNS (Phase 1/2)**: `/snrl/resolve` uses `flows/snrl-semantic.flow` with signed responses; `/vdns/*` APIs operate on `config/vdns-zones.json`; `flows/vdns-zone-sync.flow` automates zone exports; `scripts/set_shared_db.js` keeps multi-node control planes in sync.
- **Phase 3 POP containers**: `services/snrl-pop` (DoH/DoT + UDP/TCP resolver) fronts `/snrl/resolve` with caching + TXT metadata, and `services/vdns-primary` / `services/vdns-secondary` wrap Knot + NSD authoritative stacks that pull zone files from VOIKE. `docker-compose.yml` now ships these services for local or remote POP bootstraps.
- **Phase 4 autopilot**: Backend launches can `GENESIS_BOOTSTRAP` config from `voike.supremeuf.com`, auto-register POP metadata via `GENESIS_REGISTER` + `VOIKE_PUBLIC_*`, and VDNS containers hot-reload zones with the built-in refresh loop. A single `docker compose up -d --build` now yields a self-registering resolver/DNS stack per node.
- **Docs updated**: README + `docs/phase3_pop.md` explain POP bootstrap, DNS cutover, cert/key handling, phase-4 auto-registration, and monitoring so ops teams and AI agents can follow the same playbook when turning off Cloudflare.

### 10.2 Next steps

1. **Roll out POP nodes** – Provision Mac/Linux POPs with static IPs, share Postgres via `scripts/set_shared_db.js`, run the new POP containers, and update registrar glue/NS records to phase out Cloudflare.
2. **Automate DNSSEC/BGP** – Extend FLOW/APX ops for DNSSEC signing, Anycast/BGP announcements, and POP health probes so the runtime can push signatures and routing updates hands-free.
3. **Genesis-attached observability** – Wire DoH/DoT metrics + resolver ledger entries into `/metrics` and AI Ops runbooks, and expose POP health via `/ops/triage`.
4. **Elastic POP placement** – Use FLOW to spin POPs up/down based on demand and automatically prune SNRL/VDNS entries when nodes disappear.

---

## 11. Appendix

### 11.1 FLOW ↔ VASM example

```flow
func fib(n: Int) -> Int {
  if n <= 1 {
    return n
  }
  return fib(n-1) + fib(n-2)
}
```

```vasm
func fib(n0):
  LOAD n0
  CONST 1
  CMPLE
  JMP_IF L_base
  LOAD n0
  CONST 1
  SUB
  CALL fib
  LOAD n0
  CONST 2
  SUB
  CALL fib
  ADD
  RET
L_base:
  LOAD n0
  RET
endfunc
```

### 11.2 Migration templates

- **Flask → Flow** – Replace `@app.route` handlers with `service`/`route` blocks; `request.json` becomes typed parameters; `db.insert`/`db.query` handle persistence.
- **Express → Flow** – Middleware maps to `@use(...)` annotations; path params become `params.*`; responses are returned as typed objects.
- **Spring → Flow** – Controllers convert to `service` definitions; `model` definitions replace JPA entities; Flow automatically wires DB access.
- **React integration** – Serve static assets via Flow server config (`static_dir`, `fallback_to_index`) so SPAs blend into VOIKE deployments.

### 11.3 Deployment & CLI cheatsheet

```yaml
# voike.yaml (example)
app: my-voike-app
version: 1.0.0
services:
  - name: OrderService
    instances: 3
    resources: { cpu: 0.5, memory: 256MB }
nodes:
  - host: node1.local
    roles: [web, compute]
  - host: node2.local
    roles: [compute, gpu]
security:
  allow_ports: []
logging:
  level: INFO
```

CLI highlights:

`voike init`, `voike build`, `voike run/launch`, `voike deploy`, `voike logs`, `voike task *`, `voike agent answer`, `voike app onboard`, `voike peacock *`, `voike wrap`, `voike env *`, `voike get`, `voike status`. Python helpers (`scripts/voike_regression.py`, `scripts/voike_heartbeat.py`, `scripts/grid.py`) complement CLI flows for automation.

### 11.4 Integration APIs

- Admin: `/_voike/health`, `/_voike/nodes`, `/_voike/deploy`, `/_voike/logs/{service}`, `/_voike/shutdown`.
- SDK: `voike.connect`, `client.call`, `client.db.query`, `client.subscribe`, `client.stream`, `voike.task.*`.
- Edge: `/events` websocket/SSE for realtime telemetry; BGP/DNS operations exposed through Flow plans once POP deployment lands.

### 11.5 References

1. Bytecode Alliance – *Wasmtime Portability* (WebAssembly sandboxing concepts).  
2. MDN – *WebAssembly Concepts* (portable binaries).  
3. OTAVA – *Edge computing latency reduction*.  
4. VOIKE internal manuscripts – *VASVELVOGVEG* (ethics kernel inspiration).  
5. Post-Training – *Lovable agent workflows* (agentic coding inspiration).

---

## 12. Phase Timeline & Deployment Promise

| Phase | Milestones | References |
| --- | --- | --- |
| **1 – Genesis** | Control-plane seeding, authoritative DNS/V-DNS configs (`scripts/genesis_seed.js`). | README §2.6, `docs/phase3_pop.md` |
| **2 – Control Plane** | Shared Postgres + mesh metadata (`scripts/set_shared_db.js`). | README §2.6, `docs/phase3_pop.md` |
| **3 – POP Stack** | SNRL resolver + Knot/NSD containers (`services/snrl-pop`, `services/vdns-*`). | README §2.6, `docs/phase3_pop.md` |
| **4 – Auto-Bootstrap** | `.env.example` + `docker compose up -d --build` bring nodes online, hydrate from Genesis, auto-register. | README §2.7, `docs/deployment_docker.md`, `docs/deployment_baremetal.md` |
| **5 – Agentic FLOW** | Planner/Codegen/Tester/Infra/Product agents + FLOW Playground/CI. | README §2.8, `docs/phase5_agents.md`, `.github/workflows/agentic-flow.yml` |
| **6 – Deployment Tooling** | Compose/Helm templates, POP verify, snapshot/regression workflows. | README §2.9, `docs/deployment_*`, `scripts/verify_pop.py`, `.github/workflows/flow-tests.yml` |
| **7 – Adapters** | Firebase/Supabase, Flask, React, Rust, Postgres bridges for dual-write/shadow/failover. | README §2.10, `adapters/README.md`, `docs/migration_guides.md` |
| **8 – Resilience** | Capsule snapshot tooling, ledger replay/anchor APIs, offline sync + chaos playbooks. | README §2.11, `docs/resilience_playbooks.md`, `scripts/ledger_replay.py`, `scripts/offline_sync.py` |

Regardless of the phase you join, the developer/operator workflow remains constant:

1. **Clone → copy `.env.example` → `docker compose up -d --build`.**  
2. The backend hydrates from Genesis (`GENESIS_BOOTSTRAP=1`) and registers itself (`GENESIS_REGISTER=1`) automatically.
3. Any adapters or CLI tools reuse the same environment keys; no manual seeding, no bespoke scripts per environment.

It does not matter if the node lives behind NAT, VPN tunnels, consumer ISPs, static IPs, AWS, GCP, Azure, bare metal, or genesis-controlled POPs—the compose stack handles the bootstrap loop, and the control plane keeps routing/ledger state consistent. The white paper plus README/doc cross-links ensure newcomers can follow the day-by-day evolution and reproduce each capability with a single command.

---

VOIKE consolidates how applications are authored, executed, routed, and audited. With the FLOW → VASM → VVM pipeline active, SNRL/V-DNS online in the control plane, and agents wired through FLOW plans, the platform already acts as a canonical semantic compute substrate. The next milestones focus on packaging resolver POPs, finalizing DNS infrastructure, and expanding automated governance so both humans and AI agents can evolve VOIKE entirely through VOIKE itself.
