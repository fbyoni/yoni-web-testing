# 247artists.com — self-contained local replica

A fully static, locally-served mirror of the public **247artists.com** WordPress
site (the custom `creatorspc` webpack theme). It makes **zero runtime calls to
external domains** — every JS/CSS/font/image is served from disk.

## Layout

```
247artists/
├── site/        ← SERVED CODE (readable). Pretty-printed; this is what runs.
├── legacy/      ← ARCHIVE (raw minified scrape). Reference only — never served.
├── server.mjs   ← zero-dep static server (serves site/ by default)
└── scripts/
    ├── scrape.mjs          ← crawl 247artists.com → legacy/
    ├── clean-external.mjs  ← strip 3rd-party tags (GTM/Clarity/HubSpot/wsimg) in legacy/
    ├── inject-shim.mjs     ← add net-shim + local-fixes to legacy/ pages
    ├── deoptimize.mjs      ← pretty-print legacy/ → site/ (the served copy)
    ├── runtime/            ← source-of-truth guard files (net-shim, local-fixes)
    └── puppeteer-remote-smoke.mjs  ← verify every page: 0 external / 0 failed / 0 4xx
```

**The readable code in `site/` is the main code.** `legacy/` holds the original
minified bundles purely for reference (e.g. to diff against the live site or
re-deoptimize); nothing in the serve/runtime path touches it.

## Serve it (readable)

```bash
npm install            # puppeteer-core + prettier (dev only)
PORT=5273 npm run serve   # → http://localhost:5273
```

(Default port is 5173; this workspace's gethapply replica already uses it, so
247artists is served on 5273.)

## Rebuild from scratch

```bash
npm run build   # scrape → clean → shim → deoptimize  (legacy/ then site/)
```

Then verify against a manually-launched Chrome debug session
(`--remote-debugging-port=9222`, see ../PLAYBOOK.md):

```bash
BASE_URL=http://localhost:5273 npm run verify:puppeteer
```

A green run reports `ok: true` with `external: 0, failed: 0, localErrors: 0`
across all 21 pages.

## Notes

- `site/` is generated — edit `legacy/` + the scripts and re-run `deoptimize`,
  or treat `site/` as the editable source going forward (it is valid, working,
  reformatted code).
- Outbound `<a href="https://…">` links (social, subdomains, newsletter) are
  intentionally kept — they only fire on user click, never at load.
- The `net-shim.js` guard loads first in every `<head>` as defense-in-depth and
  neutralizes any external network primitive the static layer missed.
```
