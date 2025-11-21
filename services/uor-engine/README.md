# UOR Engine (Module 5 prototype)

Ultra-Optimized Runtime sample implemented in Rust. Targets:

- Tickless runtime with <30 MB idle footprint
- WASM module loader via `wasmtime`
- LMDB/Redb-friendly async background tasks (placeholder)
- `/status` HTTP endpoint (`warp`) for PerfWatch dashboards

## Run locally
```bash
cd services/uor-engine
cargo run --release
```

Environment variables:

| Variable | Description |
| --- | --- |
| `UOR_BIND_ADDR` | IP:port to bind (default `0.0.0.0:9090`). |
| `UOR_WASM_MODULE` | Optional path to a `.wasm` file. Loaded + cached on boot to simulate cold/warm module loads. |

`GET /status` returns PerfWatch-style telemetry (`cpu_percent`, `rss_mb`, `sleep_state`, etc.) so Module 5 dashboards can compare the Rust microkernel to the Node.js control plane.
