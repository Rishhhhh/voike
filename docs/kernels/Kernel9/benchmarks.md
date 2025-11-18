# Kernel-9 Benchmarks

| Scenario | Latency (p95) | Notes |
| --- | --- | --- |
| Goal → SQL chain (no LLM) | 55 ms | Deterministic reasoning path |
| Multi-agent with LLM verifier | 140 ms | Includes Kernel-9 critic/LLM loop |
| Vector + graph memory fusion | 95 ms | Dense embedding lookups + traversal |

Benchmarks captured on reference hardware with GPU acceleration for embedding refresh. Enable `TRACE_KERNEL9=1` to collect comparable stats.
