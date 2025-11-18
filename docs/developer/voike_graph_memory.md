# VOIKE Graph Memory

## Features
- Persistent knowledge graphs stored alongside relational data
- Node & edge embedding support to align with vector search
- Agentic reasoning on graph traversals via kernels
- Versioned snapshots & replication for safe experimentation

## Example
```python
client.graph.add_node("user123", properties={"role": "admin"})
client.graph.add_edge("user123", "project456", type="owns")
results = client.graph.query("user123 connections")
```

## Operations
- Schema auto-creation via ingestion or explicit `graph.schema.upsert`
- MCP tools can traverse graphs with safe depth limits
- Ledger records include graph mutations for audit trails
