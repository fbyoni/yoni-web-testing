# Spree Starter

A Rails application pre-configured with [Spree Commerce](https://spreecommerce.org). Use it as a starting point for your own store, or as the backend for a headless storefront.

## Quick Start

The fastest way to get started is with [create-spree-app](https://github.com/spree/spree/packages/create-spree-app):

```bash
npx create-spree-app my-store
```

This scaffolds a full project with Docker, a Next.js storefront, and this backend — all configured and ready to run.

## Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/spree/spree-starter)

One click deploys the backend (web + worker), PostgreSQL, and Redis.

## Manual Setup

### Prerequisites

- Ruby (see `.ruby-version`)
- PostgreSQL
- Redis

### Install & Run

`bin/setup` will use [Mise](https://mise.jdx.dev/) to install all dependencies.

```bash
bin/setup
bin/dev
```

The app starts at [http://localhost:3000](http://localhost:3000).

- **Admin:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **API:** [http://localhost:3000/api/v3/store/products](http://localhost:3000/api/v3/store/products)
- **Health check:** [http://localhost:3000/up](http://localhost:3000/up)

Default admin credentials are created during `db:seed`.

## Docker

Build and run with Docker:

```bash
docker build -t my-spree .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://user:pass@host:5432/spree \
  -e REDIS_URL=redis://localhost:6379/0 \
  -e SECRET_KEY_BASE=$(bin/rails secret) \
  my-spree
```

See [Docker deployment docs](https://docs.spreecommerce.org/developer/deployment/docker) for a full `docker-compose.yml` example.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes (production) | PostgreSQL connection URL |
| `REDIS_URL` | Yes (production) | Redis URL for jobs, caching, and Action Cable |
| `SECRET_KEY_BASE` | Yes (production) | Generate with `bin/rails secret` |
| `PORT` | No | Web server port (default: 3000) |

See [Environment Variables docs](https://docs.spreecommerce.org/developer/deployment/environment_variables) for the full list (SMTP, S3, Sentry, SSL, etc.).

## Customization

This is a standard Spree application. Customize it however you need. See the [Spree Customization Guide](https://docs.spreecommerce.org/developer/customization) for details.

## License

[MIT](LICENSE.md)
