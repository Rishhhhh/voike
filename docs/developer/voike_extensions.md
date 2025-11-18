# VOIKE Extensions / Addons

## Features
- Marketplace for community and internal extensions
- Plugin interface for new ingestion types, AI models, or serverless functions
- Automatic versioning & dependency management with semantic version locks

## Extension Anatomy
- `extension.yaml` describing capabilities, permissions, triggers
- Optional WASM or container payload for compute-heavy tasks
- MCP tool registrations exported during activation

## Lifecycle
1. Publish extension to marketplace or private registry
2. Project owners enable extension via CLI/Console/API
3. Kernels load capabilities dynamically and expose new commands/events

## Security
- Extensions run inside sandboxed runtimes with scoped API keys
- Cost governor monitors per-extension usage
- Audit logs capture every activation/deactivation
