# ORCH-FLOW Specification (v0.1)

ORCH-FLOW is a FLOW profile for orchestrating VOIKE itself. It models tasks like "plan feature", "generate code", "run tests", and "deploy" as FLOW steps so agents can drive the VOIKE stack through declarative plans.

## 1. Goals
- Describe orchestrator work as FLOW (parse/plan/execute already exist).
- Provide standard ops for talking to agents (`RUN AGENT`), invoking CLI/VPKG jobs, and recording outputs.
- Enable Planner/Codegen/Tester/Infra agents to share the same spec.

## 2. Syntax additions
- `RUN AGENT "name" WITH key=value, ...` → new FLOW op (`RUN_AGENT@1.0`). Returns a stub payload today; future versions will call `/orchestrator/agents` and `/orchestrator/tasks` automatically.
- `RUN JOB`, `ASK_AI`, `OUTPUT` behave identically to core FLOW.

Example snippet:
```text
FLOW "Add PDF ingest"

INPUTS
  text projectId
  text description
END INPUTS

STEP plan =
  RUN AGENT "planner" WITH projectId = projectId, summary = description

STEP codegen =
  RUN AGENT "codegen" WITH projectId = projectId, spec = description

STEP tests =
  RUN AGENT "tester" WITH projectId = projectId

STEP launch =
  RUN AGENT "infra" WITH projectId = projectId, artifacts = codegen.output

STEP out =
  OUTPUT launch AS "result"

END FLOW
```

## 3. Registry
Document ORCH-FLOW plans inside `orchestrator` tasks or a dedicated repo. Each plan references real `/orchestrator/projects` entries so VOIKE can tie results back to tasks.

## 4. Future
- Bind `RUN_AGENT` to actual orchestrator task execution, e.g. `RUN AGENT "planner" WITH taskId = ...` returns live step info.
- Add `DEPLOY_SERVICE` / `CAPSULE_SNAPSHOT` ops for infra-heavy orchestrations.
