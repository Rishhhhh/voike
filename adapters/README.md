# VOIKE Multi-Platform Adapters

Phase 7 introduces reference adapters for popular stacks. Every adapter demonstrates:

1. How to dual-write (existing backend + VOIKE) so you can shadow traffic safely.
2. How to consult VDNS + SNRL when cloud dependencies are degraded.
3. How to fail over entirely to VOIKE storage / chat / FLOW ops when Firebase/Supabase/etc. drop.

Adapters included:

- **Firebase/Supabase (TypeScript)** – wrap Firestore/Supabase clients and mirror writes into `/ingest` + `/chat` while reading VOIKE via `/query`.
- **Flask (Python)** – middleware that proxies REST calls into VOIKE, with local caching for offline periods.
- **React (TypeScript)** – a hook that auto-refreshes Playground data, dual-writes through `fetch` + VDNS fallback.
- **Rust (Reqwest + sqlx)** – CLI/worker template to stream logs into VOIKE Capsule snapshots.
- **Postgres (SQL + Node)** – migration snippets / triggers for dual-writing tables toward VOIKE Grid/Blob services.

Every subfolder contains:

- A short README describing integration steps.
- Code sample(s) with comments showing dual-write/shadow/failover switches.
- Environment hints (`VOIKE_API_URL`, `VOIKE_API_KEY`, `VOIKE_VDNS_DOMAIN`, etc.).

Use these templates as-is, or copy them into your own repos and extend. They all assume `.env` contains the same keys documented in the root README + `docs/migration_guides.md`.
