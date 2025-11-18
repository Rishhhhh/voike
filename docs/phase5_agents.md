# Phase 5 – Agentic Self-Evolution

Phase 5 turns VOIKE’s FLOW plans into a complete agent loop. Planner, Codegen, Tester, Infra, and Product agents now run end-to-end, register their work with the Orchestrator, and can be triggered from CI/CD or the Playground API.

## 1. Feature Specs

Save the feature spec you want agents to execute (Markdown is fine). The spec should include:

- Title / short summary
- Desired FLOW/agent updates (README/docs/flows/etc.)
- Any CI/CD or deployment expectations

Use `docs/phase5_agents.md` as the canonical spec for the Phase 5 rollout. Update this file for future evolutions so agents can always read the latest intent.

## 2. FLOW Plan

`flows/voike-self-evolve.flow` encodes the Phase 5 pipeline:

1. `APX_EXEC "source.readFile"` loads a spec from disk. Pass `featureSpecOverride` when invoking FLOW remotely to send inline text (the server still prefers local files when available).
2. `RUN AGENT "planner"` → the new `EvolutionAgentService` creates structured steps and a linked orchestrator task.
3. `RUN AGENT "codegen"` → synthesizes candidate diffs plus suggested commands.
4. `RUN AGENT "tester"` → checks file existence / FLOW validity and records a report.
5. `RUN AGENT "infra"` → emits deployment commands + capsule reminders.
6. `RUN AGENT "product"` → produces the executive summary that becomes the FLOW output.

All agents write steps to `/orchestrator/tasks` so the Planner/Codegen/Tester/Infra/Product history is visible from the API and CLI.

### Triggering via API

```bash
SOURCE=$(jq -Rs . < flows/voike-self-evolve.flow)
SPEC=$(jq -Rs . < docs/phase5_agents.md)

# plan
PLAN_ID=$(curl -s -X POST "$VOIKE_API_URL/flow/plan" \
  -H "content-type: application/json" \
  -H "x-voike-api-key: $VOIKE_API_KEY" \
  -d "{\"source\":$SOURCE}" | jq -r '.id // .planId')

# execute
curl -s -X POST "$VOIKE_API_URL/flow/execute" \
  -H "content-type: application/json" \
  -H "x-voike-api-key: $VOIKE_API_KEY" \
  -d "{\"planId\":\"$PLAN_ID\",\"inputs\":{\"projectId\":\"$VOIKE_PROJECT_ID\",\"featureSpecPath\":\"docs/phase5_agents.md\",\"featureSpecOverride\":$SPEC},\"mode\":\"sync\"}"
```

The response includes the Product agent summary plus orchestrator metadata for the run.

## 3. GitHub Action

`.github/workflows/agentic-flow.yml` runs on push/PR/dispatch. Configure repository secrets:

- `VOIKE_API_URL` – Playground or production VOIKE URL.
- `VOIKE_API_KEY` – API key for the Playground project.
- `VOIKE_PROJECT_ID` – The corresponding VOIKE project UUID.

When secrets are set the workflow:

1. Plans `flows/voike-self-evolve.flow` through `/flow/plan`.
2. Executes the plan with `projectId`, `featureSpecPath`, and an inline spec override.
3. Prints the Product summary so reviewers can see what agents produced for that commit.

If secrets are not configured the workflow exits early with a skip notice.

## 4. Playground Tips

- Use `/playground/flow-ui` with the Playground API key to visualize the AST/plan.
- Start with `featureSpecPath=docs/phase5_agents.md`; add overrides when testing uncommitted specs.
- Inspect `/orchestrator/tasks` after a run to review each agent step (planner, codegen, tester, infra, product).
- The Tester agent validates `.flow` files by parsing them through the FLOW compiler—broken flow syntax will surface immediately.

## 5. Extending Agents

`src/orchestrator/evolution.ts` is the single place to expand planner/codegen/tester/infra/product logic:

- Plug in additional APX targets (e.g., `capsules.create`, `grid.submitJob`) to make infra richer.
- Update `inferFiles` + `createChange` heuristics as new directories/services appear.
- Attach more tests (call regression scripts, heuristics) once the upstream lint error is resolved.

Whenever the spec or plan changes, update this document plus the FLOW file so the Playground, CLI, and CI all stay in sync.
