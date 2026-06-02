#!/usr/bin/env bash
# Stop the stack. By default stops the backend Docker services and any running
# storefront dev server. Pass --wipe to also delete all data (DB, search, uploads).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="docker compose -f $ROOT/backend/docker-compose.dev.yml"

echo "==> Stopping storefront dev server (if running)..."
pkill -f "next dev" 2>/dev/null && echo "    stopped." || echo "    not running."

if [ "${1:-}" = "--wipe" ]; then
  echo "==> Stopping backend and WIPING all data volumes..."
  $COMPOSE down -v
else
  echo "==> Stopping backend (data preserved)..."
  $COMPOSE down
fi
echo "Done."
