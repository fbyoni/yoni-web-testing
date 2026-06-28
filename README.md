# yoni-web-testing

Multi-project workspace for fully self-contained, locally-served replicas of
public websites.

Each project lives in its own folder and ships its own static `site/`, scrape
scripts, and Node static server.

## Projects

| Folder        | Live source           | Notes                                   |
| ------------- | --------------------- | --------------------------------------- |
| `gethapply/`  | `gethapply.com`       | Shopify storefront mirror, no API calls |
| `247artists/` | `247artists.com`      | WordPress (creatorspc theme) mirror; webpack lazy chunks + per-section CSS mirrored, GTM/Clarity/HubSpot/wsimg stripped |
| `teropa-loop/`| `teropa.info/loop`    | Single-page impress.js generative-music presentation; webpack-hashed media + 593 Salamander piano samples mirrored, Open Sans vendored, served at `/loop/` |

## Run a project

```bash
cd gethapply
npm run serve   # http://localhost:5173
```

## Add a new project

See [`PLAYBOOK.md`](./PLAYBOOK.md) for the end-to-end workflow:
scrape → serve → audit external refs → strip → inject runtime net-shim → verify.
