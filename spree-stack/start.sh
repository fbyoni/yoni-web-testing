#!/usr/bin/env bash
# Start the whole self-contained Spree stack:
#   - backend (Spree + extensions, built from local source) via Docker
#   - storefront (Next.js) via local Node
# First run also generates the API key and seeds sample data.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="docker compose -f $ROOT/backend/docker-compose.dev.yml"

echo "==> Building & starting backend (Docker)..."
$COMPOSE up -d --build

echo "==> Waiting for backend health (http://localhost:3000/up)..."
until curl -sf http://localhost:3000/up >/dev/null 2>&1; do sleep 2; done
echo "    backend is up."

echo "==> Ensuring publishable API key..."
KEY="$($COMPOSE exec -T web bin/rails spree:cli:ensure_api_key 2>/dev/null | grep -oE 'pk_[A-Za-z0-9]+' | head -1)"
echo "    key: $KEY"

echo "==> Writing storefront/.env.local..."
cat > "$ROOT/storefront/.env.local" <<EOF
SPREE_API_URL=http://localhost:3000
SPREE_PUBLISHABLE_KEY=$KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
EOF

echo "==> Checking for sample data..."
COUNT="$($COMPOSE exec -T web bin/rails runner 'print Spree::Product.count' 2>/dev/null | tail -1)"
if [ "${COUNT:-0}" = "0" ]; then
  echo "    no products found — loading sample data (this takes a few minutes)..."
  $COMPOSE exec -T web bin/rails spree:load_sample_data
else
  echo "    $COUNT products already present — skipping seed."
fi

echo "==> Starting storefront (Next.js dev server on :3001). Press Ctrl-C to stop it."
echo "    (Backend keeps running in Docker — use ./stop.sh to stop it.)"
cd "$ROOT/storefront"
[ -d node_modules ] || npm install
exec npm run dev
