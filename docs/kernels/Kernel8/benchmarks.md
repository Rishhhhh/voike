# Kernel-8 Benchmarks

| Scenario | Latency (p95) | Notes |
| --- | --- | --- |
| SQL only (10 joins) | 38 ms | Deterministic path, no LLM involvement |
| Hybrid SQL + vector rerank | 72 ms | Includes embedding fetch + reranker |
| Graph enrichment + MCP | 110 ms | Tool execution adds sandbox overhead |

Benchmarks captured on the reference cluster (8 vCPU, 32 GB RAM, A10 GPU). Enable tracing to reproduce using `npm run regression -- --trace`.
