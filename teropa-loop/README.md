# teropa-loop

Fully self-contained local mirror of **https://teropa.info/loop/** —
Tero Parviainen's interactive [impress.js](https://github.com/impress/impress.js)
presentation *"How Generative Music Works"*.

Everything the browser needs is served from `site/`; the page makes **zero
runtime calls to external domains**.

## Run

```bash
cd teropa-loop
npm run serve            # -> http://localhost:5173  (auto-redirects to /loop/)
# open http://localhost:5173/loop/
```

Advance slides with the space bar / arrow keys. Audio starts after the first
user gesture (Web Audio autoplay policy — same as the live site).

## What this is

A single-page webpack app. Unlike the Shopify/WordPress replicas in this repo,
every asset is referenced **document-relative** (`bundle.js`,
`main.<hash>.css`, `static_assets/...`) and webpack's public path is `""`, so the
mirror keeps the exact original layout under `site/loop/` and needs **no URL
rewriting** — the local copy resolves identically when served at `/loop/`.

### Asset inventory (`site/loop/`, ~108 MB, 850 files)

| Group | What | How it was found |
| ----- | ---- | ---------------- |
| Core | `index.html`, `main.<hash>.css`, `bundle.js` (4.3 MB), `static_assets/tracery.js`, `static_assets/audiokeys.js` | direct `<link>`/`<script>` tags |
| Webpack media | 186 `.mp3` music clips + 14 png / 15 svg / 1 jpg / 1 wav | 32-hex-hashed names scraped out of `bundle.js` and the CSS (public path `""` → live next to `bundle.js`) |
| Fonts | Aleo + Averia Serif Libre (woff2/woff/eot/svg) | `url()` in `main.<hash>.css` |
| Piano | 593 Salamander Grand Piano samples under `static_assets/Salamander/` | the `tone-piano` library streams `./static_assets/Salamander/`; filenames (`<note>v1..16.mp3`, `rel1..88.mp3`, `harmL<note>.mp3`, `pedalU1/D1.mp3`) were reconstructed from the library's URL builders in `bundle.js` and probed against the server |

### Open Sans (canvas labels)

`bundle.js` uses [Web Font Loader](https://github.com/typekit/webfontloader) to
pull **Open Sans** from Google Fonts, and draws interactive control labels on
`<canvas>` with `font = size + "px 'Open Sans'"`. The external request is now
blocked by the net-shim; instead the latin Open Sans subsets are vendored to
`static_assets/fonts/opensans/` and declared via `local-fixes.css`, with
`local-fixes.js` calling `document.fonts.load(...)` so the font is resident
before any canvas widget draws. No CSS body text uses Open Sans, so the article
prose is unaffected either way.

## Section-jump menu (local-only addition)

`nav.css` + `nav.js` add a subtle hamburger button (always visible, top-right)
that opens a list of all 31 sections; clicking one jumps straight there via the
impress.js API (`window.impress().goto(stepEl)`), with the current section
highlighted (tracked off the bubbling `impress:stepenter` event). This is **not
part of the original site** — it's a convenience so you don't have to space-bar
through the whole deck. The scraper injects the two files idempotently
(`injectNav()`), so a re-scrape keeps the menu; it never overwrites them.

## Known offline gap: Helsinki tram map tiles

The two "Trams of Helsinki" slides render a [Leaflet](https://leafletjs.com) map
whose basemap tiles come from CartoDB
(`http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`) — a dynamic,
effectively-infinite tile service that can't be fully mirrored as static files.
net-shim blocks those requests, so **offline the map backdrop is blank** on
those two slides. The tram-line animation and the generated music still work;
only the street-map background is missing. Everything else in the deck is
pixel-identical offline. (Vendoring the specific tiles for the fixed Helsinki
view is possible if exact fidelity there is needed.)

## How it was built

`scripts/scrape.mjs` (run with `npm run scrape`) is purpose-built for this site:

1. Fetch the page; inject `net-shim.js` as the first `<head>` child.
2. Download the core scripts + stylesheet.
3. Scan `bundle.js` + CSS for 32-hex hashed asset names and download each from `/loop/<name>`.
4. Probe the full Salamander sample namespace and keep whatever the server serves
   (teropa.info answers missing files with a 200 soft-404 HTML page, which the
   scraper detects via content-type and discards).
5. Vendor Open Sans (latin) and wire `local-fixes.{css,js}` into the page.

Network I/O goes through `curl` (Node's raw sockets are blocked in this
sandbox). The scraper is resumable — it skips files already on disk.

`net-shim.js` (shared with the other projects, served from the site root at
`/net-shim.js`) is defense-in-depth: it neutralizes any off-origin
`fetch`/XHR/`sendBeacon`/`<script|img|link>.src`/WebSocket attempt the bundle
makes at runtime.

## Verification

Verified in a real browser (Chrome via the browser tools):

- **Network:** every `localhost:5173/loop/...` request is **200**; no external
  request reaches the network. The only non-200 is `/favicon.ico` (404) —
  faithful, since the live site has no favicon either (it returns a soft-404).
- **Console:** the single `[net-shim] blocked external link[href]:
  fonts.googleapis.com/...` warning is the expected defensive block (Open Sans
  is served locally). `runtime.lastError` lines come from browser extensions,
  not the page. `Uncaught (in promise)` lines are Tone.js AudioContext
  autoplay-policy rejections that also occur on the live site.
- **Rendering:** title slide (Aleo display font + metallic gradient), the
  zooming impress.js camera transitions, the "It's Gonna Rain" canvas tape-reel
  animation, and audio-sample loading (hashed `.mp3` + Salamander notes) all
  work.

Screenshots captured during verification: `/tmp/teropa-title.png`,
`/tmp/teropa-slide4.png`, `/tmp/teropa-rain.png`.
