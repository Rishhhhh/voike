# VOIKE Cost Governor

## Purpose
- Monitor token usage, compute consumption, and egress per project
- Provide per-query cost metrics back to clients and ledger
- Throttle or reroute workloads to cheaper execution paths when budgets trigger

## Signals
- Estimated token count per kernel/model
- GPU/CPU utilization from inference nodes
- MCP tool duration + external service billing hooks
- User-defined budgets (daily, monthly, per-session)

## Interventions
- Downgrade to distilled models when near limits
- Pause non-critical MCP tools and queue for review
- Emit `cost.alert` events over `/events`
- Update `/kernel/state` with `costMode` metadata so SDKs can react

## Implementation Notes
- Configured via `cost_governor.yaml`
- Every decision is logged; clients can fetch via `/metrics` or ledger queries
