# Spree Stack — fully self-contained

A complete Spree Commerce store in one folder: a Next.js storefront and a Rails +
Spree backend, **both running from local source you can read and edit**. Spree core
and all four extensions are vendored — nothing is pulled from a hosted Spree service.

```
spree-stack/
├── start.sh            # build + start everything (backend in Docker, storefront via Node)
├── stop.sh             # stop everything   (--wipe to also delete data)
├── storefront/         # Next.js 16 storefront (full source)
└── backend/            # Rails 8 + Spree (full source)
    ├── spree/          # vendored Spree monorepo @ v5.4.3 (core/api/admin)
    ├── extensions/     # vendored extensions, built from source:
    │   ├── spree_i18n            @ v5.3.2
    │   ├── spree_stripe          @ v1.7.0
    │   ├── spree_adyen           @ v0.11.0
    │   └── spree_paypal_checkout @ v0.7.0
    ├── Dockerfile              # builds the backend image from the vendored source
    └── docker-compose.dev.yml  # web + worker + postgres + redis + meilisearch
```

## Prerequisites
- Docker (running) — provides Postgres, Redis, Meilisearch, Ruby/Rails runtime
- Node.js 20+ — runs the storefront dev server

## Quick start
```bash
./start.sh        # first run builds the image, generates an API key, seeds sample data
```
Then open:
- Storefront → http://localhost:3001/us/en
- Admin      → http://localhost:3000/admin  (spree@example.com / spree123)
- Store API  → http://localhost:3000/api/v3/store/products

Stop with `Ctrl-C` (storefront), then `./stop.sh` (backend). `./stop.sh --wipe` deletes all data.

## How "from source" works
The backend's `Gemfile` switches the `spree*` gems to **path sources** when `SPREE_PATH`
and `EXT_PATH` are set (see `docker-compose.dev.yml`). The Dockerfile copies the vendored
source in before `bundle install` and re-resolves `Gemfile.lock` against it. At runtime the
source dirs are **bind-mounted**, so edits to `backend/spree/**` or `backend/extensions/**`
take effect after a restart:

```bash
docker compose -f backend/docker-compose.dev.yml restart web worker   # apply code edits
docker compose -f backend/docker-compose.dev.yml up -d --build         # apply .gemspec/dep edits
```

Verify gems load from local paths:
```bash
docker compose -f backend/docker-compose.dev.yml exec web bundle show spree_core
# => /rails/spree/spree/core
```

## What is local vs. external
- **Local source (editable):** storefront, backend app, Spree core/api/admin, 4 extensions.
- **Local runtime (Docker images):** Ruby, Postgres, Redis, Meilisearch — pulled once, then offline.
- **Local data:** Docker named volumes (`spree-stack_postgres_data`, `…_redis_data`,
  `…_meilisearch_data`, `…_storage_data`), scoped to the `spree-stack` compose project.
- **Still from RubyGems/npm:** Rails and other ordinary library dependencies (resolved at build
  time). Only Spree itself is vendored.

## Notes
- The storefront runs natively via Node (not Docker) on purpose: Spree builds product image
  URLs from the request host, so the storefront must reach the backend at the same
  `http://localhost:3000` the browser uses. Running it natively keeps those URLs valid.
- `backend/docker-compose.yml` (the original prebuilt-image setup) is left in place as a fallback.
