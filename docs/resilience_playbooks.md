# Resilience Playbooks (Phase 8)

## Capsule Snapshots

- Run `python scripts/make_capsule_snapshot.py --memo "Nightly"`.
- Store the resulting `capsuleId` in your change log.
- To restore, `curl -X POST /capsules/{id}/restore -H "x-voike-api-key: ..."`.

## Ledger Replay & Anchoring

- Replay entries via the new `/ledger/replay` API or `python scripts/ledger_replay.py`.
- Anchor the ledger hash with `/ledger/anchor` to prove integrity:
  ```bash
  curl -X POST $VOIKE_API_URL/ledger/anchor \
    -H "x-voike-api-key: $VOIKE_API_KEY" \
    -d '{"since":"2025-01-01T00:00:00Z"}'
  ```

## Offline Sync

- Run `python scripts/offline_sync.py --interval 0 --capsules` to pull ledger/capsule data before disconnecting.
- During outages, point applications to the cached file (the React/Flask adapters include logic to read it when VOIKE is unreachable).

## Chaos Testing

- Enable `CHAOS_ENABLED=true` in `.env`.
- Optionally set `CHAOS_FAULT_PROBABILITY=0.1` and `CHAOS_MAX_DELAY_MS=2000`.
- Run `python scripts/verify_pop.py` afterwards to validate that POP + DNS services still return valid responses.

## Rollback & Replay Procedure

1. Export the ledger: `python scripts/export_ledger.py --output rollback-ledger.json`.
2. Replay relevant transactions: `python scripts/ledger_replay.py --since <timestamp> --output replay.json`.
3. Restore Capsules corresponding to the rollback point.
4. Run `/ledger/anchor` and store the resulting hash alongside your incident report.

## DNS / Cloud Outage Playbook

- Switch adapters to failover mode (set `VOIKE_FAILOVER=1` or use the provided toggles) so they stop calling Firebase/Supabase.
- Use `vdns` + `snrl` endpoints to locate healthy POPs:
  ```bash
  curl -X POST $VOIKE_API_URL/snrl/resolve \
    -H "x-voike-api-key: $VOIKE_API_KEY" \
    -d '{"domain":"api.voike.com"}'
  ```
- Continue ingest/query/chat through VOIKE alone until the outage clears.

All of these steps are referenced in the README Phase 8 section plus the CLI scripts introduced in Day 8.
