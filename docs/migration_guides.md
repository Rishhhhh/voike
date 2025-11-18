# Migration Guides (Phase 7)

This document explains how to reroute Firebase/Supabase, Flask/Express, React, Rust, and Postgres workloads through VOIKE while keeping existing cloud infrastructure online.

## Dual-Write

1. Write to your current datastore first (Firestore/Supabase/Postgres).
2. Mirror the payload to VOIKE via `/ingest/file` using the adapters under `adapters/`.
3. Compare responses by calling `/query` in “shadow” mode. Differences should be logged to `/ledger/replay` so you can inspect them later.

## Shadow Mode

- Keep user traffic on the legacy service.
- Issue the same call to VOIKE (e.g., `/chat`, `/ai/ask`, `/grid/jobs`) and store the output in `capsules` or `knowledge nodes`.
- Use `/ledger/replay` to promote verified actions from shadow → primary.

## Failover & VDNS

- Configure `VOIKE_VDNS_DOMAIN` in every adapter. When Firebase/Supabase is unreachable, route reads/writes to the VDNS-resolved VOIKE endpoint.
- For HTTP clients, catch network errors and call `https://<vdns-domain>` directly with the same headers (`x-voike-api-key`, `content-type: application/json`).

## Postgres Playbook

1. Enable the `http` extension.
2. Apply `adapters/postgres/dual_write.sql` for each table you want to mirror.
3. Run the `NOTIFY` listener (Node, Rust, Python) to re-send payloads when HTTP is down.
4. Optionally use `/ledger/anchor` nightly to anchor the mirror history.

## React / Frontend

- Wrap fetch calls in the provided hook (`adapters/react/useVoikeClient.ts`).
- Use `dualWrite` helper to keep SaaS APIs plus VOIKE in sync.
- When offline, the hook automatically retries through VDNS.

## Rust / Python Workers

- Use the templates to push telemetry/logs into VOIKE Capsules.
- Schedule `python scripts/offline_sync.py` so local caches stay in sync even when cloud dependencies fail.

For full examples, open each adapter directory and follow the README instructions.
