# VOIKE AI Layer

## Features
- Agentic LLM calls via MCP for deterministic orchestration
- Kernel orchestration (K8/K9) merges relational, vector, and graph reasoning paths
- Multi-modal reasoning support (text, image, audio)
- Serverless triggers for post-query actions

## Example
```python
response = client.ai.run(
    table="sales",
    prompt="Summarize revenue trends by region"
)
```

## Controls
- Provide `context` metadata (session ids, persona) to steer kernel behavior
- Use `max_cost` or `route_hint` to influence model router selections
- Enable `trace=true` for detailed kernel/LLM logs streamed to the ledger
