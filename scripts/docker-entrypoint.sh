#!/bin/sh
set -e
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
fi
exec node -r tsconfig-paths/register dist/index.js
