# Self-Contained Spree Setup

This backend runs **Spree from local source**, not the prebuilt `ghcr.io/spree/spree` image.
Everything runs locally; the only network use is the initial Docker image pulls + gem/asset
downloads at build time.

## Layout

| Path | What |
|---|---|
| `spree/` | Vendored Spree monorepo @ **v5.4.3** (Ruby gems only — `.git`, JS packages & docs stripped). |
| `spree/spree/{core,api,admin,emails}` | The actual gems bundler builds via a `path` source. |
| `Gemfile` | Switches `spree*` gems to the path source when `SPREE_PATH` is set. |
| `Dockerfile` | Copies `./spree` before `bundle install`, re-resolves `Gemfile.lock` against the path source. |
| `docker-compose.dev.yml` | Builds the image locally and bind-mounts `./spree` for live editing. |

## Run (from-source — this is the active setup)

```bash
docker compose -f docker-compose.dev.yml up -d        # start
docker compose -f docker-compose.dev.yml logs -f web  # logs
docker compose -f docker-compose.dev.yml down         # stop (keep data)
docker compose -f docker-compose.dev.yml down -v      # stop + wipe data
```

- Store API: http://localhost:3000/api/v3/store/products  (header `X-Spree-Api-Key: <key>`)
- Admin: http://localhost:3000/admin  (`spree@example.com` / `spree123`)
- Publishable API key: regenerate/print with
  `docker compose -f docker-compose.dev.yml exec web bin/rails spree:cli:ensure_api_key`

## Editing Spree source

`./spree` is bind-mounted into the container at `/rails/spree`, so edits to the gem source
are live. Because the app boots in `RAILS_ENV=production` (eager-loaded), restart to apply:

```bash
docker compose -f docker-compose.dev.yml restart web worker
```

If you change gem **dependencies** (a `.gemspec`), rebuild:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

## Sample data / key

```bash
docker compose -f docker-compose.dev.yml exec web bin/rails spree:load_sample_data
docker compose -f docker-compose.dev.yml exec web bin/rails spree:cli:ensure_api_key
```

## Notes

- The original prebuilt-image setup is still in `docker-compose.yml` (`docker compose up -d`).
- Storefront extensions (`spree_i18n`, `spree_stripe`, `spree_adyen`, `spree_paypal_checkout`)
  still come from RubyGems — only Spree core/api/admin are vendored. To vendor those too,
  clone each repo under `spree/` and add path entries to the `Gemfile`.
- Data lives in Docker named volumes (`postgres_data`, `redis_data`, `meilisearch_data`,
  `storage_data`) — local to this machine, scoped to the `spree_starter` compose project.
