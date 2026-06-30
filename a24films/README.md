# a24films — self-contained local replica

A fully static, offline mirror of [`a24films.com`](https://a24films.com/) (the
A24 film studio's Craft CMS site). Makes **zero runtime calls to external
domains** — every page, image, font, stylesheet and script is served from the
local `site/` tree.

## Run it

```bash
cd a24films
npm run serve            # → http://localhost:5173  (set PORT=xxxx to change)
```

Then open <http://localhost:5173/>. Reload with DevTools open: every request is
to `localhost`, and the Console shows at most a single defensive
`[net-shim] blocked external XHR …` for the live site's CSRF-token poll.

## What's mirrored

| Bucket | Notes |
| ------ | ----- |
| **406 HTML pages** | home, `/films` + every film detail, `/television`, `/notes` index + the full editorial archive back to 2017, `/docs`, `/jobs` + listings, `/privacy-policy`, `/terms-of-use` |
| **~2,090 images** | all hero/still/poster art from the `atwenty-four.transforms.svdcdn.com` image CDN. Each CDN *transform* (the `?w=…&fit=…` query) is mirrored to its own file (query hashed into the filename) so every responsive variant resolves offline |
| **35 font files** | Adobe Typekit *akzidenz-grotesk* (woff2/woff/otf, with the kit CSS + `p.typekit.net` import fully localized) **and** the self-hosted *NB International Pro* family |
| **app.css / app.js** | the site's own bundle, rewritten to local asset paths |

Total: ~2,590 files, ~480 MB.

## Client-side shop / cart

The on-site shop carousels link out to `shop.a24films.com`. For an offline,
self-contained demo, `local-fixes.js` adds a **fully client-side cart** (no
backend, no network):

- every `.stack-item.product` card gets an **Add to cart** button + a price
  (deterministically derived from the product title, since the source markup
  carries none);
- a floating **Cart** launcher (bottom-right) shows a live item count;
- a slide-in **drawer** lists line items with image, qty +/− steppers, remove,
  and a running subtotal;
- **Checkout** shows an "Order confirmed" modal with the total paid, and
  **empties the cart** on dismiss.

State persists in `localStorage` (`a24MockCart`). Styling (`local-fixes.css`)
matches the A24 black/white aesthetic. Both files live in `scripts/runtime/` so
a fresh scrape + `npm run shim` re-installs them automatically.

## How it was built

Four scripts under `scripts/`, run via `npm run build`
(`scrape → clean → shim`):

1. **`scrape.mjs`** — BFS-crawls the origin from a seed route list, following
   same-origin links plus references in CSS/JS. Mirrors each off-host asset
   under `site/assets/<host>/…` and rewrites every URL it finds to a local
   absolute path. a24-specific handling:
   - HTML-decodes `&amp;` so CDN image URLs canonicalize correctly;
   - hashes the query string into CDN filenames (the query is a real image
     transform, not a cache-buster);
   - resolves rewritten paths from the *actual file written to disk* (so
     extensionless Typekit font URLs like `…/l?primer=…` map to the
     `.woff2` we saved);
   - exact-host matching so the separate `shop.` / `app.` / `aaa24.`
     `.a24films.com` apps stay as outbound links, not local assets;
   - **disk-based resume** + per-request `--max-time`, so a re-run reuses
     everything already downloaded and never stalls on a slow/junk URL.
2. **`clean-external.mjs`** — strips third-party `<script>`/`<link>` tags and
   inline analytics/consent/Typekit-loader bootstraps; empties external
   `<img>`/`<iframe>` src. Leaves outbound `<a href>` links and the *local*
   Typekit font stylesheet intact.
3. **`inject-shim.mjs`** — copies the runtime guards into `site/` and injects
   `net-shim.js` as the first child of `<head>` on every page (plus
   `local-fixes.{css,js}`, and re-asserts the font stylesheet link).
4. **`net-shim.js`** — defense-in-depth: monkey-patches `fetch` / `XHR` /
   `sendBeacon` / element `src` setters / `WebSocket` etc. so any off-origin
   request the bundle attempts at runtime is neutralized.

`verify.mjs` (`npm run verify`, server must be up) crawls a sample (or `--all`)
and reports any reference that doesn't resolve locally or still points off-host.

## Verification

`node scripts/verify.mjs --all` over all 406 pages:

```
Local assets OK (200):    2132
Local assets BROKEN:      1     (see below)
External asset refs left: 8     (all <a href> outbound links — no runtime fetch)
```

Browser check (Chrome DevTools, cache disabled): home, a film detail
(`/films/marty-supreme`) and a notes article all load with **0 external network
requests**; fonts and imagery render correctly.

### Known limitations

- **1 broken image** — `IF_Hi_Res.jpg?w=8250` on `/films/in-fabric`. The page
  only ever requests this single 8250px width and the CDN now returns `400` for
  it (the signed URL is stale) — **it is broken on the live site too**. No valid
  variant is obtainable, so the replica reflects the original.
- **8 outbound `<a href>` links** in old (2017–2022) editorial posts point at
  third-party image/PDF hosts (shopify CDN, giphy, rackcdn, a casting-call PDF).
  These are user-clicked links, never fetched on page load, so they don't break
  offline rendering — kept as-is to match the source.
- **CSRF / newsletter / search** have no backend offline. `app.js`'s one runtime
  call (CSRF token) is caught by `net-shim`; the newsletter submit is a no-op
  via `local-fixes.js`.

## Rebuild from scratch

```bash
rm -rf site && npm run build && npm run serve
# then: node scripts/verify.mjs --all
```
