# Kernel-9 Codegen Interface

## gRPC / MCP Schema
```json
{
  "name": "kernel9.reason",
  "input": {
    "goal": "string",
    "context": { "projectId": "uuid", "sessionId": "string" },
    "memory": { "vector": "array?", "graph": "array?" },
    "constraints": { "maxCost": "number?", "riskLevel": "string?" }
  },
  "output": {
    "chain": [ { "action": "sql|vector|tool|ai", "explanation": "string" } ],
    "energyUsage": "number",
    "traceId": "string"
  }
}
```

Type-safe clients exist for Node, Python, and Go to embed Kernel-9 inside bespoke builders or agents.
