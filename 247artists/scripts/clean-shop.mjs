#!/usr/bin/env node
// clean-shop.mjs — make the mocked Shopify "Horizon" shop fully self-contained.
//
// Operates ONLY on legacy/shop/** (does not touch the shared clean-external.mjs
// or any other route). For every shop HTML page it:
//   1. Removes external <link> (preconnect/dns-prefetch/preload/etc.) and
//      external <script src="https?://..."> tags (shopifysvc, shop.app,
//      cdn.shopify.com runtime, extensions.shopifycdn, etc.).
//   2. Removes LOCAL <script src> / <link rel="modulepreload|preload"> tags that
//      point at pure Shopify Pay / shop-js / analytics modules whose only job is
//      to talk to an external service (shop-js loaders, shopify_pay, portable
//      wallets, web-pixels, standard-actions, shop_events_listener, preloads.js,
//      autosizes-uploader, importmap-polyfill/es-modules-shim, perf-kit,
//      origin_trials, load_feature, hcaptcha). These reference runtime chunks
//      that were never mirrored (the ~59 local 404s) — a mocked shop needs none.
//   3. Removes inline <script> beacons (monorail/otlp telemetry, web-pixels
//      manager, trekkie, boomerang, Shopify analytics, shop-js bootstraps,
//      hcaptcha, ShopifyPay/shop.app config).
//   4. Ensures <script src="/net-shim.js"></script> is the FIRST child of <head>.
//   5. Ensures <link  rel="stylesheet" href="/shop-mock.css"> in <head> and
//      <script src="/shop-mock.js" defer></script> as the LAST child of <body>.

import {readFile, writeFile} from 'node:fs/promises';
import {readdirSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';

const SHOP_ROOT = resolve('legacy/shop');

// ---- patterns -------------------------------------------------------------

// Any URL hitting one of these (local OR remote) is a pure 3rd-party / pay /
// analytics / shop-js module. Match against script src + link href and drop.
const THIRD_PARTY_URL_PATTERNS = [
  'shopifysvc.com',
  'monorail-edge',
  'otlp-http',
  'shop.app',
  'extensions.shopifycdn.com',
  'shopifycloud/shop-js',
  'shopifycloud/web-pixels-manager',
  'shopifycloud/storefront-forms-hcaptcha',
  'shopifycloud/portable-wallets',
  'shopifycloud/perf-kit',
  'shopifycloud/importmap-polyfill',
  'es-modules-shim',
  'shopifycloud/autosizes-uploader',
  'shopify_pay/storefront',
  'storefront/origin_trials',
  'storefront/load_feature',
  'shop_events_listener',
  'standard-actions.js',
  '/checkouts/internal/preloads.js',
  'web-pixels',
  'hcaptcha',
];

// Inline-script body needles that mark a pure 3rd-party bootstrap/beacon.
const INLINE_NEEDLE_PATTERNS = [
  'monorail-edge',
  'shopifysvc.com',
  'otlp-http',
  'web-pixels-manager',
  'webPixelsManager',
  'wpmLoader',
  'trekkie',
  'boomerang',
  'BOOMR',
  'Shopify.analytics',
  'serverPixel',
  'shopifycloud/shop-js',
  'extensions.shopifycdn.com',
  'window.ShopifyPay',
  'ShopifyPay.apiHost',
  'hcaptcha',
  'shop.app',
];

// ---- helpers --------------------------------------------------------------

function listHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listHtmlFiles(full));
    else if (st.isFile() && entry.endsWith('.html')) out.push(full);
  }
  return out;
}

function attrValue(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2] ?? '') : null;
}

const isExternalUrl = (url) => /^(https?:)?\/\//i.test(url || '');
const isThirdPartyUrl = (url) =>
  !!url && THIRD_PARTY_URL_PATTERNS.some((p) => url.includes(p));

// ---- transforms -----------------------------------------------------------

function stripLinkTags(html, log) {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attrValue(tag, 'href');
    const rel = (attrValue(tag, 'rel') || '').toLowerCase();
    if (/\b(?:canonical|alternate)\b/.test(rel)) return tag; // metadata, no fetch
    if (isExternalUrl(href) || isThirdPartyUrl(href)) {
      log.linksRemoved++;
      return '';
    }
    return tag;
  });
}

function stripScriptSrcTags(html, log) {
  return html.replace(
    /<script\b[^>]*\bsrc\s*=\s*["'][^"']*["'][^>]*>\s*<\/script>/gi,
    (tag) => {
      const src = attrValue(tag, 'src');
      if (isExternalUrl(src) || isThirdPartyUrl(src)) {
        log.scriptSrcRemoved++;
        return '';
      }
      return tag;
    }
  );
}

function stripInlineBeacons(html, log) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, body) => {
    if (/\bsrc\s*=/i.test(attrs)) return full; // external src handled above
    if (/type\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attrs)) return full; // keep data/importmap
    if (/type\s*=\s*["']importmap["']/i.test(attrs)) return full;
    const b = body || '';
    if (!b.trim()) return full;
    for (const needle of INLINE_NEEDLE_PATTERNS) {
      if (b.includes(needle)) {
        log.inlineRemoved++;
        return '';
      }
    }
    return full;
  });
}

function neutralizeRecommendations(html, log) {
  // The Horizon <product-recommendations> web component fetches its markup from
  // the live Shopify "/recommendations/products" Section Rendering API, which
  // does not exist in the static mirror (causes a retrying 404 storm that never
  // lets the page reach network-idle). Blank its data-url so the component has
  // nothing to fetch, and drop the loader script.
  let out = html.replace(
    /<script\b[^>]*\bsrc\s*=\s*["'][^"']*product-recommendations\.js["'][^>]*>\s*<\/script>/gi,
    () => {
      log.recsNeutralized++;
      return '';
    }
  );
  out = out.replace(/(<product-recommendations\b[^>]*?)\sdata-url\s*=\s*(?:"[^"]*"|'[^']*')/gi, (m, pre) => {
    log.recsNeutralized++;
    return pre + ' data-url=""';
  });
  return out;
}

function ensureNetShimFirst(html, log) {
  // Remove any existing net-shim tag, then inject right after <head>.
  let out = html.replace(/<script\b[^>]*src\s*=\s*["']\/net-shim\.js["'][^>]*>\s*<\/script>\s*/gi, '');
  const shim = '<script src="/net-shim.js"></script>';
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, (m) => `${m}\n${shim}`);
    log.netShim++;
  }
  return out;
}

function ensureMockRefs(html, log) {
  let out = html;
  // CSS in <head>
  if (!/href\s*=\s*["']\/shop-mock\.css["']/i.test(out) && /<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, '<link rel="stylesheet" href="/shop-mock.css">\n</head>');
    log.mockCss++;
  }
  // JS as last child of <body>
  out = out.replace(/<script\b[^>]*src\s*=\s*["']\/shop-mock\.js["'][^>]*>\s*<\/script>\s*/gi, '');
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, '<script src="/shop-mock.js" defer></script>\n</body>');
    log.mockJs++;
  }
  return out;
}

async function processFile(file) {
  const original = await readFile(file, 'utf8');
  const log = {
    linksRemoved: 0,
    scriptSrcRemoved: 0,
    inlineRemoved: 0,
    netShim: 0,
    mockCss: 0,
    mockJs: 0,
    recsNeutralized: 0,
  };
  let html = original;
  html = stripLinkTags(html, log);
  html = stripScriptSrcTags(html, log);
  html = stripInlineBeacons(html, log);
  html = neutralizeRecommendations(html, log);
  html = ensureNetShimFirst(html, log);
  html = ensureMockRefs(html, log);
  if (html !== original) await writeFile(file, html, 'utf8');
  return log;
}

// ---- run ------------------------------------------------------------------

const files = listHtmlFiles(SHOP_ROOT);
const totals = {linksRemoved: 0, scriptSrcRemoved: 0, inlineRemoved: 0, netShim: 0, mockCss: 0, mockJs: 0, recsNeutralized: 0};
for (const file of files) {
  const log = await processFile(file);
  for (const k of Object.keys(totals)) totals[k] += log[k];
  console.log(file.replace(SHOP_ROOT + '/', 'shop/'), log);
}
console.log('---');
console.log('Shop pages processed:', files.length);
console.log('Totals:', totals);
