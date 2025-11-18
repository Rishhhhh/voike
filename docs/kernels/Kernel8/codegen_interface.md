# Kernel-8 Codegen Interface

## gRPC / MCP Schema
```json
{
  "name": "kernel8.plan",
  "input": {
    "sql": "string",
    "semanticText": "string?",
    "filters": "object?",
    "context": { "projectId": "uuid", "sessionId": "string" }
  },
  "output": {
    "correctedSql": "string",
    "plan": [ { "type": "sql|vector|graph", "weight": "number" } ],
    "traceId": "string"
  }
}
```

Generated clients exist in TypeScript + Python. Each exposes `plan()` that returns deterministic traces for debugging.
