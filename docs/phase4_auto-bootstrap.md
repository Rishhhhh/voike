# Phase 4 – Genesis Auto-Bootstrap & Auto-Registration

Phase 4 guarantees every VOIKE node (backend + resolvers) comes online with a single command: `docker compose up -d --build`. No manual seeding or follow-up curl invocations are required after the canonical Genesis node has been initialized once.

## Prerequisites

1. **Seed Genesis once** – Run `npm run genesis -- --core-url https://voike.supremeuf.com` (or equivalent) on the canonical host so `/vdns/*` and `/snrl/*` contain authoritative data.
2. **Populate `.env`** – Copy `.env.example` to `.env` and override only the values that differ (e.g., real `GENESIS_URL`, admin tokens, POP hostnames/IPs). By default:
   - `GENESIS_BOOTSTRAP=1` and `GENESIS_REGISTER=1` so every node syncs + registers automatically.
   - `VOIKE_PUBLIC_*`, `SNRL_*`, and `VDNS_*` are prefilled for a dev POP; adjust as needed.

## One-Command Bootstrap

```bash
docker compose up -d --build
```

This single command starts:
1. **Postgres + backend** – Backend blocks on Genesis bootstrap ⇒ pulls VDNS/SNRL state before serving traffic.
2. **Auto-registration** – After HTTP server starts, it posts its resolver metadata + DNS records back to Genesis (using `VOIKE_PUBLIC_*`).
3. **snrl-pop + vdns primaries/secondaries** – Resolver POP containers point at the backend and begin serving DoH + UDP/TCP immediately.

## Verifying the Node

After compose completes:

```bash
docker compose logs backend | grep genesis
docker compose logs snrl-pop | tail -n 20
dig @127.0.0.1 -p 1053 voike.supremeuf.com A
curl http://localhost:8053/healthz
```

You should see:
- `[genesis] synced DNS + SNRL config` before backend starts serving.
- `[genesis] registered SNRL endpoint with genesis` / `[genesis] registered zone record…` when auto-registration succeeds.
- Resolver health showing cache metrics.
- `dig` returning A/AAAA/TXT answers sourced from `/snrl/resolve`.

No additional scripts or manual curl calls are required; new nodes always hydrate from Genesis and register themselves, ensuring consistent DNS and resolver state across the fleet.
