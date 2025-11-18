# Docker / Compose Deployment Guide

Phase 6 focuses on “run VOIKE with us, or run VOIKE yourself.” This guide walks through a batteries-included Docker deployment using the reference Compose + Helm templates that now live in the repo. Remember: once `.env` is in place, **every environment boils down to `docker compose up -d --build`**—no additional bootstrap scripts, seeds, or manual steps.

## 1. Prerequisites

- Docker Engine v24+ (Desktop or server)
- Docker Compose plugin
- Access to a Postgres instance (bundled compose stack ships a local container)
- VOIKE API/admin tokens (or use the defaults while experimenting on localhost)

## 2. Bootstrapping with Compose

1. Copy `.env.example` to `.env` and customize the `VOIKE_NODE_*`, `GENESIS_*`, `SNRL_*`, and `VDNS_*` values. The example now includes every variable required for automatic Genesis bootstrap + registration.
2. Start the stack:
   ```bash
   docker compose up -d --build
   ```
   This uses the root `docker-compose.yml` (backend + Postgres + POP helpers). Logs are available via `docker compose logs -f`.
3. Verify the POP and resolver state:
   ```bash
   python scripts/verify_pop.py \
     --base-url http://localhost:8080 \
     --api-key $VOIKE_PLAYGROUND_API_KEY \
     --admin-token $VOIKE_ADMIN_TOKEN \
     --domain api.voike.com
   ```

### Reference Compose Template

`deploy/compose/voike-playground.compose.yml` is a trimmed template that only binds the required VOIKE + Postgres services. Drop it into any Docker host and run:

```bash
cd deploy/compose
docker compose -f voike-playground.compose.yml --env-file ../../.env up -d
```

The template exposes 8080/8053/1053/8853 so you can connect Playground, DoH, UDP/TCP DNS, and DoT from other machines on the network.

## 3. Helm Template (Kubernetes-friendly)

If you would rather schedule VOIKE on Kubernetes, use the lightweight chart in `deploy/helm/voike`:

```bash
helm upgrade --install voike ./deploy/helm/voike \
  --set image.tag=$(git rev-parse --short HEAD) \
  --set env.VOIKE_NODE_MODE=baremetal \
  --set env.DATABASE_URL=postgres://user:pass@pg:5432/voikex
```

Key chart features:

- Configurable environment variables via `values.yaml` (`env` map mirrors `.env.example`).
- Service definition exposing both HTTP (8080) and DoH/DNS listener ports.
- Optional persistence hooks for Postgres/volumes (add via `values.yaml` as needed).

## 4. CI/CD Examples

Two GitHub Actions workflows ship as examples:

1. `.github/workflows/flow-tests.yml` – validates FLOW plans against the Playground API (parses multiple `.flow` files, fails fast if planning fails).
2. `.github/workflows/snapshot-ci.yml` – invokes `scripts/make_capsule_snapshot.py` to capture a Capsule snapshot during CI. Both workflows skip gracefully when `VOIKE_API_URL`, `VOIKE_API_KEY`, and `VOIKE_PROJECT_ID` secrets are not configured.

Use these workflows as blueprints for your own pipelines (self-hosted runners work equally well).

## 5. Snapshot & Ledger Tooling

New helper scripts live in `scripts/`:

- `make_capsule_snapshot.py` – POST `/capsules` to create snapshots (used by the snapshot workflow).
- `export_ledger.py` – dumps `/ledger/recent` to JSON for audits.
- `verify_pop.py` – hits `/snrl/resolve` + `/vdns/zones/:id/export` to make sure POP + DNS services match Genesis.

Each script accepts `--base-url` / `--api-key` flags (and `--admin-token` where needed) so you can run them from laptops, CI, or cron.

## 6. Next Steps

- Keep `docs/phase5_agents.md` updated with the newest self-evolution specs so your Docker deployment can run agentic flows locally.
- Pair this guide with `docs/deployment_baremetal.md` if you plan to pin POP nodes directly to hardware.
