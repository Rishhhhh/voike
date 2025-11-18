#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

if ! command_exists brew; then
  echo "Homebrew is required on macOS. Install it from https://brew.sh and re-run this script."
  exit 1
fi

echo "Installing base dependencies via Homebrew..."
brew install node@20 \
  pnpm \
  jq \
  watchman \
  psycopg@16 || true

brew install --cask docker || true
brew install colima || true

echo "Ensuring Docker/Colima are running..."
if ! docker info >/dev/null 2>&1; then
  colima start --cpu 4 --memory 8 || true
  open -g -a Docker || true
fi

echo "Bootstrapping VOIKE repository..."
pushd "$ROOT_DIR" >/dev/null

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
fi

npm install

echo "Preparing CLI..."
pushd cli >/dev/null
npm install
npm run build
npm link
popd >/dev/null

echo "Building backend..."
npm run build

echo "Starting Docker services..."
docker compose pull
docker compose up -d --build

echo "VOIKE backend is building in Docker. Use 'npm run dev' for local mode or 'voike --help' for CLI usage."
popd >/dev/null
