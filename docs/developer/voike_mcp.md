# VOIKE MCP (Model Context Protocol)

## Capabilities
- Register tools & functions for LLM-directed workflows
- Define JSON schemas to validate agent inputs/outputs
- Manage sandboxed execution environments per project
- Support multi-agent orchestration with scoped session context

## Example Usage
```python
client.mcp.register_tool(
    "calculate_metrics",
    schema={"input": {"type": "object", "properties": {"table": {"type": "string"}}}}
)
client.mcp.run_tool("calculate_metrics", table="sales")
```

## Execution Flow
1. Client sends `name`, `input`, and `context.sessionId`
2. Router enforces ACLs + rate limits using the caller's API key
3. Kernel selects deterministic or LLM-backed executor
4. Outputs are logged to Truth Ledger + `/mcp/tools` metadata cache

## Tips
- Use `context.tags` to trace multi-agent workflows
- Enable `safeMode` when tools call external services
- Combine MCP outputs with `client.ai.run(..., mcpTools=[...])` for structured reasoning
