# VOIKE CLI Reference

## Commands
- `voike login --api-key <key>` — authenticate and cache credentials
- `voike db list` — list tables and logical collections
- `voike ingest <file> --table <name>` — multi-modal ingestion with auto-schema detection
- `voike vector search <query>` — vector similarity search across embeddings
- `voike ai run <prompt>` — agentic LLM inference orchestrated through kernels
- `voike functions invoke <name>` — call serverless functions attached to your project
- `voike mcp tools` — enumerate registered MCP tools and schemas
- `voike events tail` — subscribe to ingestion/query/kernel events via WebSocket

## Profiles & Context
- CLI respects `--profile` to switch between projects/api keys
- `~/.voike/config` stores encrypted API keys; set `VOIKE_DISABLE_CONFIG=1` for ephemeral runs
- Commands inherit `VOIKE_BASE_URL` for custom deployments

## Automation Tips
- Wrap CLI invocations inside CI jobs for smoke tests
- Use `--json` to emit machine-readable responses
- Combine `voike ingest` + `voike ai run` for regression scripts similar to `scripts/voike_regression.py`
