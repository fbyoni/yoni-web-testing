# Self-Contained Local Replica Playbook

End-to-end workflow for taking a public website and producing a fully static,
locally-served mirror that makes **zero runtime calls to external domains**.

The reference implementation lives in `gethapply/` (a Shopify storefront
mirror). Use it as a template for new replicas: copy the folder, rename it,
re-run the scraper against the new origin, then walk the steps below.

---

## Architecture

```
yoni-web-testing/
├── README.md
├── PLAYBOOK.md              ← this file
└── <project>/                ← one folder per replicated site
    ├── package.json          ← only `node >=20`, no runtime deps
    ├── server.mjs            ← tiny static file server (port 5173)
    ├── scripts/
    │   ├── scrape.mjs            ← crawler that mirrors the live site
    │   ├── clean-external.mjs    ← strip third-party tags from HTML
    │   └── fix-shop-href.mjs     ← project-specific HTML fixups
    └── site/                 ← the static mirror itself
        ├── index.html
        ├── assets/           ← every fetched JS/CSS/image/font/video
        ├── pages/, products/, collections/, blogs/...
        ├── local-fixes.css       ← project CSS overrides
        ├── local-fixes.js        ← project JS shims (loaded at end of body)
        └── net-shim.js           ← defensive runtime guard (loaded first in <head>)
```

**Two non-negotiables:**
1. **Every file the browser needs lives under `site/`.** Nothing fetched from
   off-host at runtime — no CDNs, no analytics, no API.
2. **`net-shim.js` is the first script in `<head>` on every page.** It catches
   anything you missed at the static layer.

---

## Phase 1 — Scrape the live site

Goal: produce a complete static mirror under `site/` that opens in a browser.

### What `scripts/scrape.mjs` does

- BFS-crawls the origin starting from `/`, following same-origin links found in
  HTML (`href`, `src`, `srcset`), CSS (`url()`, `@import`), JSON, and
  sitemap-like XML.
- Mirrors hostnames as path prefixes under `site/assets/<host>/...`, so a
  resource at `https://cdn.shopify.com/foo/bar.js` is saved at
  `site/assets/cdn.shopify.com/foo/bar.js`.
- Rewrites every URL it finds inside HTML/CSS/JS to a relative path that points
  at the mirrored file (or back into the local `site/` tree).
- Skips paths that only make sense on the live backend (cart, checkout,
  account, search, monorail, etc. — see `blockedPathPrefixes` in `scrape.mjs`).
- Caps total assets at `MAX_ASSETS` and inserts a small delay between fetches.

### Run it

```bash
cd <project>
npm run scrape    # alias for `node scripts/scrape.mjs`
```

The first run will take several minutes. You can cancel and resume — the
scraper skips files that already exist on disk.

### When you're scraping a different origin

Open `scripts/scrape.mjs` and edit the constants at the top:

- `ORIGIN` — `'https://newsite.com'`
- `assetHostHints` — add the CDNs and third-party hosts the live site loads
  from (so they get mirrored as path prefixes rather than skipped)
- `blockedPathPrefixes` — backend-only paths to never crawl

---

## Phase 2 — Serve it locally

`server.mjs` is a ~80-line zero-dep Node static server:

- Roots at `./site`
- MIME map covers HTML/CSS/JS/JSON/XML/SVG/PNG/JPG/WebP/GIF/ICO/WOFF/WOFF2/TTF/MP4
- 308-redirects `/foo/index.html` → `/foo/`. **This matters** — the bundled
  storefront JS does `window.location.pathname === '/'` checks; serving the
  page as `/index.html` would break those.
- Sends `cache-control: no-store` so refreshes always pick up edits.

```bash
npm run serve     # → http://localhost:5173
```

Confirm pages load: `curl -I http://localhost:5173/` should return `200`.

---

## Phase 3 — Strip third-party references from HTML (static layer)

After the scraper runs, the HTML still contains `<script>` and `<link>` tags
that reference third-party services — even though the JS files themselves are
mirrored locally, *running them* would attempt fetches to analytics,
fingerprinting, captcha, and review backends.

### Run `scripts/clean-external.mjs`

```bash
node scripts/clean-external.mjs
```

It walks every `*.html` under `site/` and removes:

- `<link>` whose `href` is a third-party path (`cdn.shopify.com/extensions/`,
  `judge.me`, `googletagmanager`, `connect.facebook.net`, `analytics.tiktok.com`,
  `bat.bing.com`, `clarity.ms`, `hcaptcha`, `marker.io`, …)
- `<script src="…">` to those same hosts
- inline `<script>` blocks that mention any of those host strings (Shopify
  monorail beacons, gtag bootstrap, judge.me loader, hCaptcha challenge, etc.)
- third-party `<img>`, `<iframe>`, `<source>`, `<video>` `src` (replaced with
  empty string so the layout doesn't collapse)

It deliberately **leaves alone**:

- `<a href="https://…">` user-clicked navigation
- `<link rel="canonical">` metadata
- inline scripts that only touch the local DOM

Tune the `EXTERNAL_HOST_PATTERNS` and `THIRD_PARTY_PATH_PATTERNS` arrays at the
top of the file for new sites.

### Project-specific HTML fixups

`scripts/fix-shop-href.mjs` is a one-off example: the live theme's nav-handler
wires up the megamenu hover only if the Shop anchor's `href` contains the
`#shop` fragment, but the scraper rewrote the href to a real page URL on inner
routes. The script restores `href="#shop"` on the header nav (without touching
the footer Shop link).

Add similar one-off scripts under `scripts/` whenever the live JS depends on a
specific HTML shape that the scraper didn't preserve.

---

## Phase 4 — Manual audit for residual external references

Even after Phase 3, things can hide in `data-*` attributes, JSON islands, or
inside the bundled storefront JS itself. Audit before declaring victory.

### 4a. Static audit

```bash
cd site

# All hosts that show up in HTML attrs (script/link/img/iframe/source/...)
grep -rEhno '<[a-z]+[^>]*(href|src|srcset|action|data-[a-z-]+)=["'\''](https?:)?//[^"'\'']+' --include="*.html" \
  | grep -oE '(https?:)?//[a-zA-Z0-9.-]+' | sort -u

# CSS url() to external hosts
grep -rEhno 'url\(["'\'']?(https?:)?//[^)"'\'']+' --include="*.css" --include="*.html" | sort -u

# data-* attrs that the bundled JS reads to fire XHRs (judge.me's data-url is
# the canonical example — its widget JS reads this and POSTs to api.judge.me)
grep -rEhno 'data-[a-z-]+=["'\''](https?:)?//[^"'\'']+' --include="*.html" | sort -u

# preconnect/dns-prefetch/preload hints to external hosts
grep -rEhno '<link[^>]*rel=["'\''](preconnect|dns-prefetch|preload|prefetch|modulepreload)' --include="*.html"
```

### 4b. Audit the bundled JS

The minified storefront bundle can build endpoints at runtime from
`Shopify.shop`, `window.location`, etc. Sanity-check it:

```bash
cd site/assets/<bundled-js-dir>

# Hardcoded hostnames the bundle could reach
grep -hEo '[A-Za-z_]+\.(myshopify|shopifycloud|shopifycdn|shopifysvc|judge\.me|googletagmanager|google-analytics|facebook\.net|facebook\.com)' *.js | sort -u

# fetch() targets
grep -hEo 'fetch\([^)]{1,100}' *.js | sort -u

# Webpack public-path math (chunks should resolve to a same-origin URL)
grep -nE 'i\.p\s*=' runtime__*.js
```

If the bundle constructs URLs from `Shopify.shop` etc., either:

- replace those references with same-origin equivalents, or
- rely on the runtime shim (Phase 5) to neutralize them.

### 4c. Strip residual `data-*` URLs

Any `data-url='https://…'` you find in step 4a needs to be removed by hand or
with a one-line `sed`/Python pass. For the gethapply replica we removed
`data-url='https://api.judge.me/reviews/reviews_for_widget'` from four product
pages — without that the widget renders the inlined static review markup but
fires no XHR.

---

## Phase 5 — Inject the runtime net-shim (defense in depth)

`site/net-shim.js` is a ~130-line same-origin guard that monkey-patches every
network primitive *before* the bundled JS runs:

| Primitive                             | Off-host behaviour                              |
| ------------------------------------- | ----------------------------------------------- |
| `fetch`                               | resolves to `new Response('{}', {status:200})`  |
| `XMLHttpRequest.open`                 | rewrites the URL to `about:blank`; `send` no-ops |
| `navigator.sendBeacon`                | returns `true` without sending                  |
| `Image` constructor + `img.src` setter | silently drops the assignment                   |
| `document.createElement('script'/'iframe'/'img'/'link'/'source'/'video'/'audio'/'embed'/'track')` then `.src` / `.href` | silently drops the assignment |
| `navigator.serviceWorker.register`    | rejects                                         |
| `WebSocket`, `EventSource`            | throws                                          |

Same-origin requests (`fetch('/cart.js')`, `<img src="./local.png">`,
data/blob/about/javascript URIs) pass through untouched. Each block logs
`[net-shim] blocked external …` to the console so you can spot unexpected
attempts.

### Inject it into every page's `<head>`

```python
# scripts/inject_shim.py
import re, glob, os
os.chdir('site')
INJECT = '<script src="/net-shim.js"></script>'
HEAD_OPEN = re.compile(r'(<head\b[^>]*>)', re.IGNORECASE)
for path in sorted(glob.glob('**/*.html', recursive=True)):
    with open(path, encoding='utf-8') as f: html = f.read()
    if 'net-shim.js' in html: continue
    new = HEAD_OPEN.sub(lambda m: m.group(1) + '\n        ' + INJECT, html, count=1)
    with open(path, 'w', encoding='utf-8') as f: f.write(new)
```

Run once after Phase 3. The shim must load **before** any deferred bundle
script — placing it as the first child of `<head>` guarantees that.

---

## Phase 6 — Verify

```bash
# 1. Server up?
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5173/

# 2. Smoke-test every page bucket
for p in / /products/sleep /collections/all /pages/our-story /blogs/news; do
  printf "%-25s " "$p"
  curl -sS -o /dev/null -w "HTTP %{http_code} (%{size_download}B)\n" "http://localhost:5173$p"
done

# 3. Shim is wired in everywhere
grep -L 'net-shim.js' site/**/*.html site/*.html 2>/dev/null
# (should be empty)
```

Then open the page in a browser. In DevTools:

- **Network tab** — every request should be to `localhost:5173`. Reload with
  cache disabled and watch.
- **Console** — any `[net-shim] blocked external …` warnings tell you the
  bundle still tries to call out. Track those down and patch them statically
  (Phase 3/4) so the shim's job is purely defensive.

### Puppeteer verification with an already-running Chrome

For browser checks in this workspace, use `puppeteer-core` against a manually
launched Chrome debug session. Do not spawn bundled/headless Chrome from the
agent shell on macOS; TCC/sandboxing can kill or deny the browser.

Launch Chrome once from a real Terminal:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=$HOME/Chrome-Debug
```

Probe scripts should connect like this:

```js
const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222'
});
```

Use these sampling rules:

- Slow-scroll in small increments, dwell about 1.5s at each sampled scroll
  position, then read DOM state. This avoids capturing mid-animation frames.
- Capture network `request`, `requestfailed`, and local `response.status() >=
  400`; success means `external.length === 0`, `failed.length === 0`, and
  `localErrors.length === 0`.
- In DOM probes, read both `getComputedStyle(el).transform` and
  `getComputedStyle(el).translate`; GSAP and app bridges may write motion to
  different properties.
- Install `evaluateOnNewDocument` guards for `window.location.assign`,
  `window.location.replace`, `window.open`, and outbound anchor clicks so live
  scripts cannot navigate the inspected page out from under Puppeteer.

The `tracingart/` project has a reusable example:

```bash
cd tracingart
npm run serve
npm run verify:puppeteer
```

It writes `site/puppeteer-remote-report.json` and
`site/puppeteer-remote-smoke.png`.

---

## Nuxt / Generated Asset Sites

Some sites do not expose all runtime assets as literal HTML/CSS links. The
Getty Tracing Art replica in `tracingart/` is the reference example for this
class of site.

### What to preserve

- Keep the original path prefix when the app expects it. Tracing Art serves
  under `/tracingart/`, so local files live under `site/tracingart/...`.
- Fetch Nuxt build metadata such as:
  `/tracingart/_nuxt/builds/meta/<buildId>.json`
- Search bundled JS for generated asset identifiers, not only literal URLs.
  Tracing Art stores image names as `img:"..."` and builds paths at runtime.
- Mirror generated image folders and variants that Puppeteer reveals. For
  Tracing Art these were:
  - `/tracingart/images/getty/intro/<name>@lg.webp`
  - `/tracingart/images/getty/intro/<name>@sm.webp`
  - `/tracingart/images/getty/still-life/<name>@lg.webp`
  - `/tracingart/images/getty/still-life/<name>@sm.webp`
  - `/tracingart/images/getty/artist-to-artist/<name>@lg.webp`
  - `/tracingart/images/getty/artist-to-artist/<name>@sm.webp`
  - `/tracingart/images/getty/world-of-gpi/<name>@lg.webp`
  - `/tracingart/images/getty/world-of-gpi/<name>@sm.webp`
- Try both NFC and NFD Unicode forms for filenames. This caught
  `Mäda-Primavesi` after the first Puppeteer pass.
- For generated spritesheets, mirror both metadata and the transformed runtime
  files. Tracing Art's metadata names `spritesheet_0.png`, but the browser
  requests `spritesheet_0@lg.webp` and `spritesheet_0@sm.webp`.

### Practical scrape loop

1. Run the initial scraper and local server.
2. Run the remote-Chrome Puppeteer smoke probe.
3. Treat every same-origin 404 in `localErrors` as a missing generated asset
   pattern, patch the scraper, and rerun it.
4. Repeat until the Puppeteer report is `ok: true`.

For Tracing Art, the final successful report had:

```json
{
  "ok": true,
  "external": [],
  "failed": [],
  "localErrors": [],
  "consoleMessages": []
}
```

### Font fallbacks

If public font URLs return 403, do not leave the CSS pointing at them. Vendor a
local fallback under `site/` and rewrite `@font-face` to the local path. Tracing
Art's Graphik WOFF2 files returned 403, so the scraper copies local Helvetica
Neue TTF files into `site/tracingart/fonts/graphik/` and rewrites the Graphik
`@font-face` URLs to those local files.

---

## Replicating a new site (TL;DR)

```bash
# 1. Bootstrap from the gethapply template
cp -R gethapply newsite
cd newsite
rm -rf site                       # start fresh
# edit scripts/scrape.mjs: ORIGIN, assetHostHints, blockedPathPrefixes
# edit package.json: name field

# 2. Phases 1–2: scrape + serve
npm run scrape
npm run serve &
curl -I http://localhost:5173/    # 200 OK?

# 3. Phase 3: strip third-party tags
# edit scripts/clean-external.mjs if the new site uses different vendors
node scripts/clean-external.mjs

# 4. Phase 4: audit (see commands above)
# patch any residual data-url / hardcoded host you find

# 5. Phase 5: copy the shim and inject
cp ../gethapply/site/net-shim.js site/
python3 ../gethapply/scripts/inject_shim.py   # or paste the snippet inline

# 6. Phase 6: verify in DevTools
```

When you're done, register the project in the top-level `README.md` table and
commit.

---

## Known limitations

- **Cart / checkout / account / search are dead.** The scraper skips them
  intentionally; the bundle's `fetch('/cart.js')` calls 404 silently. If you
  need a working cart for your replica, stub those routes in `server.mjs` to
  return `{}` / static fixtures.
- **Bundled JS is treated as a black box.** We don't recompile it; we only
  prevent its network attempts at runtime. If the live site updates a vendor
  bundle to embed a new third-party SDK, you'll need to re-scrape, re-audit,
  and re-inject. The shim catches accidents.
- **`<a href="https://…">` outbound links are kept.** They don't fire at
  runtime, only on user click. Convert them to `href="#"` if you need the site
  to be a sealed sandbox.
