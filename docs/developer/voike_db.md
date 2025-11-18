# VOIKE Database Layer

## Models Supported
- Relational (SQL)
- Vector (embedding + similarity)
- Graph (nodes & edges)
- Time-series (metrics & logs)
- Document (JSON / semi-structured)

## Features
- Agentic queries: `client.db.query("SELECT * FROM table")` triggers kernel + MCP pipelines for semantic corrections
- Auto-schema detection on ingestion, including vector embeddings + metadata columns
- Forking: TB-scale clones built in seconds via copy-on-write snapshots
- Multi-tenant isolation and per-project Truth Ledger entries

## Hybrid Query Flow
1. Query payload reaches Kernel-8 for validation + correction
2. VARVQCQC adjusts SQL / semantic text, attaches metadata
3. Cost governor + model router choose SQL, vector, or hybrid plan
4. Execution recorded in ledger and metrics surfaces, with optional MCP tool traces

## Recommended Practices
- Prefer narrow tables with metadata JSONB columns for unstructured payloads
- Use ingestion tags to group tables by modality, then join via `entity_id`
- Enable ledger streaming to maintain analytics or audit sinks
