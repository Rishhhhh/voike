#!/usr/bin/env bash

# Linux bootstrap script for VOIKE
# Works best on Ubuntu/Debian derivatives with apt.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script currently targets apt-based distros. Please adapt manually."
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo privileges (sudo $0)."
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  curl \
  git \
  build-essential \
  python3 \
  python3-pip \
  nodejs \
  npm \
  ca-certificates \
  gnupg \
  lsb-release \
  docker.io \
  docker-compose-plugin

if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@9
fi

systemctl enable docker >/dev/null 2>&1 || true
systemctl start docker >/dev/null 2>&1 || true

if ! groups "$SUDO_USER" | grep -q docker; then
  usermod -aG docker "$SUDO_USER"
  echo "Added $SUDO_USER to docker group. Re-login may be required."
fi

sudo -u "$SUDO_USER" bash <<'EOS'
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
fi

npm install

cd cli
npm install
npm run build
npm link
cd ..

npm run build
docker compose pull || true
docker compose up -d --build

echo "VOIKE backend is running. Use 'voike --help' to explore the CLI."
EOS
