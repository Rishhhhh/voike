# Rust Worker Adapter

`src/main.rs` demonstrates how to:

- Stream structured events (`serde_json`) into VOIKE `/ingest`.
- Query VOIKE via `/query` with retry/backoff.
- Persist Capsule snapshots on SIGTERM so workloads can continue offline.

Use `cargo run` to test locally. Set env vars (`VOIKE_API_URL`, `VOIKE_API_KEY`) just like other adapters.
