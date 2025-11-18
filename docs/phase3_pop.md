# VOIKE Phase 3 POP Deployment

This playbook covers the new resolver/DNS services that ship in `services/snrl-pop`, `services/vdns-primary`, and `services/vdns-secondary`. Use it when bringing up Semantic Network POPs and cutting `voike.supremeuf.com` over from Cloudflare to VOIKE-owned infrastructure.

## 1. Components

| Service | Purpose | Ports (container) | Key env vars |
| --- | --- | --- | --- |
| `snrl-pop` | DoH, UDP/TCP, and optional DoT resolver that proxies to `/snrl/resolve` and caches responses. | UDP/TCP `53`, DoH `8053`, DoT `853` | `SNRL_API_KEY`, `SNRL_CORE_URL`, `SNRL_POP_REGION`, `SNRL_POP_CAPABILITIES`, optional `SNRL_DOT_CERT_PATH` / `SNRL_DOT_KEY_PATH` |
| `vdns-primary` | Knot-based authoritative server that fetches exported zone files from VOIKE. | UDP/TCP `53` | `VOIKE_CORE_URL`, `VOIKE_ADMIN_TOKEN`, `VDNS_ZONE_ID`, `VDNS_ZONE_DOMAIN` |
| `vdns-secondary` | NSD-based secondary source of truth fed by the same VOIKE zone export. | UDP/TCP `53` | Same as primary (plus `VDNS_IDENTITY` if you want a custom server ID). |
| Genesis auto-register | Optional backend hook that pushes the POP’s record set + SNRL endpoint to the canonical Genesis deployment. | N/A | `GENESIS_URL`, `GENESIS_ADMIN_TOKEN`, `GENESIS_REGISTER`, `VOIKE_PUBLIC_*` |

All three services assume `scripts/set_shared_db.js` has pointed every VOIKE node at the same Postgres instance so `/snrl/resolve`, `/vdns/*`, `/mesh/*`, and the Truth Ledger stay in sync.

## 2. Local / Test POPs

1. **Prep `.env`** – Ensure the following variables exist (see `.env.example`):
   ```env
   SNRL_API_KEY=voike-playground-placeholder
   SNRL_POP_REGION=dev-local
   SNRL_POP_CAPABILITIES=http,gpu
   VDNS_ZONE_ID=voike-com
   VDNS_ZONE_DOMAIN=voike.supremeuf.com.
   VOIKE_ADMIN_TOKEN=voike-admin-placeholder
   ```
2. **(Optional) Generate DoT keys** – If you need DoT locally, drop PEM files into `services/snrl-pop/certs/` and set `SNRL_DOT_CERT_PATH=/certs/dot.crt`, `SNRL_DOT_KEY_PATH=/certs/dot.key` via a volume mount.
3. **Run the stack**:
   ```bash
   docker compose up snrl-pop vdns-primary vdns-secondary
   ```
   - DoH -> `http://localhost:8053/dns-query`
   - UDP/TCP -> `127.0.0.1:1053` (mapped from container port 53)
   - Knot authoritative -> `127.0.0.1:2053`
   - NSD authoritative -> `127.0.0.1:3053`
4. **Smoke tests**:
   ```bash
   # raw DNS query
   dig @127.0.0.1 -p 1053 voike.supremeuf.com A
   dig @127.0.0.1 -p 1053 voike.supremeuf.com TXT

   # DoH (binary payload from `dig` capture)
   printf '\x00\x00\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00\x05voike\x09supremeuf\x03com\x00\x00\x01\x00\x01' > query.bin
   curl -H 'content-type: application/dns-message' \
        --data-binary @query.bin \
        http://localhost:8053/dns-query | hexdump -C
   ```
   Every answer is generated from `/snrl/resolve` (with TXT metadata containing the signed candidate set). Authoritative servers pull `config/vdns-zones.json` via `/vdns/zones/:id/export`; restart them after updating zone data.

## 3. Production POP rollout

1. **Provision nodes** – Pick at least two POP machines (Mac mini, Linux edge, etc.) with static public IPs. Install Docker and clone this repo or copy the relevant service directories.
2. **Share control plane** – Run `VOIKE_SHARED_DATABASE_URL=postgres://... node scripts/set_shared_db.js` on every VOIKE backend host so mesh state, zones, and SNRL data replicate via a single Postgres instance.
3. **Build + publish images** (optional) – `docker build -t registry/snrl-pop:latest services/snrl-pop` and equivalent for `vdns-*` if you push to a registry.
4. **Configure environment** – Provide real values for:
   - `SNRL_API_KEY` – POP-specific VOIKE API key.
   - `VOIKE_ADMIN_TOKEN` – Admin token used to fetch zone exports.
   - `VDNS_ZONE_DOMAIN` – FQDN served by this POP (e.g., `voike.supremeuf.com.`).
   - TLS material for DoT if you expose it publicly.
5. **Start services** – `docker compose up snrl-pop vdns-primary vdns-secondary -d` (or run each container with your orchestrator). Confirm `curl http://<pop-ip>:8053/healthz` shows cache stats.
6. **Auto registration (Phase 4)** – set `GENESIS_BOOTSTRAP=1` to pull SNRL/DNS config from Genesis before boot, and `GENESIS_REGISTER=1` plus `VOIKE_PUBLIC_HOSTNAME/IP/REGION/CAPABILITIES` to automatically register the POP with `https://voike.supremeuf.com`. The backend posts `/snrl/endpoints` + `/vdns/records`, so every server that runs `docker compose up -d --build` becomes discoverable with zero manual steps.
6. **Registrar updates** – Register NS records for `voike.supremeuf.com` pointing to the POP IPs. If you host glue names like `ns1.voike.supremeuf.com`, add A/AAAA records via `GENESIS_REGISTER` (or `POST /vdns/records`) and wait for TTL expiry before removing Cloudflare.

## 4. Monitoring & maintenance

- **Health endpoints** – `snrl-pop` exposes `/healthz` with cache hit/miss counters. Pipe it into Prometheus/Heartbeat jobs. Knot/NSD log to stdout so you can aggregate logs centrally.
- **Ledger + metrics** – Every `/snrl/resolve` call is still recorded in VOIKE’s ledger, so you can trace which POP issued each signed candidate. Add POP-specific tags via `SNRL_POP_REGION` to correlate metrics.
- **Updating zones** – `vdns-*` containers poll `/vdns/zones/:id/export` every `VDNS_REFRESH_SECONDS` (default 60s) and issue `HUP` automatically when the zone changes. You can set a shorter refresh interval or manually trigger a reload with `docker kill -s HUP` if you need instant propagation.
- **DoT certificates** – Automate cert rotation with your preferred CA (LetsEncrypt, ACME). Mount `/certs` into `snrl-pop` and update `SNRL_DOT_CERT_PATH` / `SNRL_DOT_KEY_PATH`.
- **Genesis drift** – With `GENESIS_BOOTSTRAP=1`, the backend refreshes `config/vdns-zones.json` + `config/snrl-endpoints.json` from the canonical deployment at startup; combined with `/snrl/endpoints` admin APIs, you can programmatically manage POP metadata for every node.

## 5. Cutover checklist

1. Two POPs running with monitored DoH + UDP/TCP and consistent answers.
2. Registrar glue records for `ns1.voike.supremeuf.com` / `ns2…` pointing to POP IPs.
3. NS records updated to POPs; verify propagation via `dig NS voike.supremeuf.com`.
4. Cloudflare proxy disabled once TTLs expire.
5. Continuous monitoring (health checks + `/metrics`) and ledger audits enabled.

When finished, VOIKE owns both the semantic resolver (SNRL) and authoritative DNS data plane, and all of it lives in-repo so AI agents or humans can re-provision with a single `docker compose up`.
