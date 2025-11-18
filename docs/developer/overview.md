# VOIKE Platform Overview

VOIKE is an AI-first, multi-model, multi-modal database and agentic inference platform. It combines deterministic kernels, large language models, and traditional data engines into a single programmable surface.

## Features
- Relational + Vector + Graph + Time-series + Document storage layers in one logical catalog
- Multi-modal ingestion: JSON, CSV, Parquet, PKL, logs, telemetry, images, and audio
- Agentic DB powered by LLMs + kernels orchestrated via MCP
- Serverless function execution with event triggers tied to ingestion/query lifecycle events
- Multi-agent reasoning via Kernel-8 (K8) and Kernel-9 (K9) orchestration

## Use Cases
- AI-native web & mobile apps that need unified storage + reasoning
- Agentic dashboards and knowledge pipelines
- Research labs requiring persistent memory with reasoning hooks
- Enterprise analytics needing instant TB-scale forking + hybrid SQL/vector workloads

## Architecture Pillars
1. **Unified Storage Fabric** – Postgres-backed relational core with embedded vector, graph, and document indexes.
2. **Kernel Runtime** – Deterministic planners (K8/K9) coordinate SQL engines, embeddings, and MCP tools.
3. **Model Router** – Chooses the most efficient LLM/kernel stack per request with cost governance.
4. **MCP Layer** – Safe tool execution, schema registration, and sandboxed multi-agent loops.
5. **Extensions Marketplace** – Operators can add ingestion adapters, AI models, or serverless functions without forking the core.

The remainder of the developer docs dive into each module with API references, CLI/SDK guides, and kernel internals so you can extend VOIKE safely.
