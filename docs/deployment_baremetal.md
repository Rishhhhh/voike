# Bare-Metal Deployment Guide

Prefer to “run VOIKE yourself and join the decentralized network” without Docker? Use this guide to bring up a single-node bare-metal deployment that still participates in Genesis + POP orchestration. You still finish with the exact same command—**`docker compose up -d --build`**—after preparing the host; the compose stack bootstraps, hydrates, and registers the node automatically.

## 1. Requirements

- Ubuntu 22.04+ / macOS / any Linux with systemd
- Docker Engine 24+ and Docker Compose plugin
- Python 3.10+ (for helper scripts)
- Postgres 14+ reachable from the node (or use the bundled compose Postgres)

## 2. Prepare the Host

1. Install system packages + Docker:
   ```bash
   sudo apt-get update && sudo apt-get install -y ca-certificates curl python3 python3-venv
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   newgrp docker
   ```
2. Clone the repo and copy the env file:
   ```bash
   git clone https://github.com/Rishhhhh/voike.git
   cd voike
   cp .env.example .env
   ```
3. Edit `.env` for your site:
   - `VOIKE_NODE_MODE=baremetal`
   - Accurate `VOIKE_NODE_REGION`, `VOIKE_NODE_ZONE`, and `VOIKE_PUBLIC_*` metadata (whatever describes your host).
   - If you have a shared Postgres, set `VOIKE_SHARED_DATABASE_URL` or `DATABASE_URL`; otherwise the compose Postgres container is fine.

## 3. Launching the Services

1. Start everything with Docker (even on bare metal):
   ```bash
   docker compose up -d --build
   ```
2. (Optional) Wrap the compose command with systemd so nodes recover on reboot:
   ```ini
   [Unit]
   Description=VOIKE Bare-Metal Node
   After=network.target docker.service

   [Service]
   Type=oneshot
   RemainAfterExit=yes
   WorkingDirectory=/opt/voike
   EnvironmentFile=/opt/voike/.env
   ExecStart=/usr/bin/docker compose up -d --build
   ExecStop=/usr/bin/docker compose down

   [Install]
   WantedBy=multi-user.target
   ```

3. Verify registration + POP health:
   ```bash
   python scripts/verify_pop.py \
     --base-url http://127.0.0.1:8080 \
     --api-key $VOIKE_PLAYGROUND_API_KEY \
     --admin-token $VOIKE_ADMIN_TOKEN \
     --domain api.voike.com
   ```

## 4. Snapshots & Ledger Export

Schedule the new helper scripts via cron:

- `python scripts/make_capsule_snapshot.py --base-url http://127.0.0.1:8080 --api-key $KEY --project-id $PROJ --memo "Nightly snapshot"`
- `python scripts/export_ledger.py --base-url http://127.0.0.1:8080 --api-key $KEY --project-id $PROJ --output /var/backups/voike-ledger.json`

This ensures bare-metal nodes keep reproducible Capsules and auditable ledger history.

## 5. Joining the Network

- Keep `GENESIS_BOOTSTRAP=1` and `GENESIS_REGISTER=1` enabled so each reboot auto-synchronizes DNS/SNRL metadata and advertises itself back to Genesis.
- Use `VOIKE_NODE_ROLES` to differentiate between core compute, POP resolvers, and hybrid roles. The `.env.example` file lists every supported flag.
- Share your node’s public hostname/IP via the Genesis admin API (or run `scripts/set_shared_db.js` against the shared Postgres) so other nodes can discover you immediately.

Bare-metal nodes can still run FLOW/agents, spawn Grid jobs, and handle POP traffic—it’s the same VASM/VVM stack as Docker, just without containers.
