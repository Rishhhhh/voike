# Kernel-9 API

## REST Bridge
- `POST /kernel9/reason` – submit high-level goals, returns action chain + explanations
- `GET /kernel9/traces/{id}` – retrieve sampled amplitudes and arbitration logs

## MCP Tools
- `kernel9.reason` for agents needing deep planning
- `kernel9.energy` to inspect VAR energy + DAI state

## Events
- `kernel.reason.completed` with metadata `{ traceId, cost, energyDelta }`
- `kernel.reason.alert` when risk or cost governors intervene

Authentication matches Kernel-8. Use `route_hint=kernel9` to force this path from `/query` or `/ai` payloads.
