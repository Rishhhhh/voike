# Frontend + FLOW Integration

FLOW plans can drive frontend UI/UX too:

- Build a browser client (see `flow/src/sdk/client.ts`) that calls `/flow/*` endpoints.
- UI editors can parse/plan flows, visualize AST/plan graphs, and trigger executions.
- Designers can store FLOW plans in Capsules and replay them.
- With VASM, low-level UI logic or simulations can be compiled and streamed to the browser.

Workflow:
1. User enters FLOW script in UI.
2. Frontend calls `FlowClient.parseFlow` and renders warnings.
3. On success, call `FlowClient.planFlow` to show plan graph.
4. Execute plan via `FlowClient.executeFlow` (sync) or show job ID (async).
5. Persist Flow plans via `/flow/plans`. Frontend dashboards pull list and allow re-run or deletion.

UI surfaces:
- “FLOW Playground” – code editor + AST/plan graph visualization.
- “Execution Monitor” – show metrics per run.
- “Plan Gallery” – saved flows per project.

Because FLOW ops are semantic, the same plan can render data tables, charts, or dashboards: e.g., `OUTPUT summary` steps feed UI components. Future VASM extensions can stream UI instructions to remote clients.
