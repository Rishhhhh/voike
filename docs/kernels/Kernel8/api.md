# Kernel-8 API

## REST Bridge
- `POST /kernel8/plan` – accept hybrid query payloads, return plan + corrections
- `GET /kernel8/traces/{id}` – fetch deterministic trace for debugging

## MCP Tool
- `kernel.plan` – same payload/response as REST, accessible to agents via `/mcp/execute`

## Events
- `kernel.plan.executed` emitted on `/events` with `{ planId, latencyMs, energyDelta }`

Authentication uses project API keys; admin tokens can inspect traces across tenants.
