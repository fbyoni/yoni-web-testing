#!/usr/bin/env node
// Strip external (off-folder) asset references from every HTML page so the
// site is fully self-contained and triggers no third-party network requests.
//
// What it removes/neutralizes:
//  - <link ...> tags whose href targets an external https?:// host
//    (preconnect, dns-prefetch, preload, prefetch, modulepreload, stylesheet)
//  - <script src="https?://..."></script> tags
//  - inline <script>...</script> blocks that reference known third-party
//    services (Shopify analytics/cdn/monorail, Judge.me, Google Tag Manager,
//    Microsoft Clarity, config-security, Triple Pixel, hCaptcha)
//  - <img>, <iframe>, <source>, <video> src attributes pointing externally
//    (replaced with empty src so layout is preserved)
//
// What it intentionally leaves alone:
//  - <a href="https://...">  — user-clicked navigation, not a dependency
//  - <link rel="canonical">  — metadata only, no fetch
//  - inline <script>s that don't reference external services

import {readFile, writeFile} from 'node:fs/promises';
import {readdirSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';

const ROOT = resolve('site');

// Hosts whose mention inside an inline <script> means "third-party loader"
const EXTERNAL_HOST_PATTERNS = [
  'monorail-edge.shopifysvc.com',
  'shopifycloud',
  'shopifysvc.com',
  'cdn.shopify.com/shopifycloud',
  'cdn.judge.me',
  'cdn1.judge.me',
  'cdn2.judge.me',
  'cdnwidget.judge.me',
  'app.judge.me',
  'api.judge.me',
  'judge.me/api',
  'www.googletagmanager.com',
  'googletagmanager.com',
  'www.clarity.ms',
  'clarity.ms',
  'config-security.com',
  'extensions.shopifycdn.com',
  'triplewhale',
  'triple_pixel',
  '__triplePixel',
  'hcaptcha.com',
  'storefront-forms-hcaptcha',
  'marker.io',
  'window.markerConfig',
  'window.__Marker',
  'edge.marker.io',
];

// Path fragments that mark a script/stylesheet as a third-party module —
// even when it's been cached into our local /assets/ folder, its only purpose
// is to talk to an external service. Match these and drop the tag.
const THIRD_PARTY_PATH_PATTERNS = [
  '/cdn.shopify.com/extensions/',                    // judgeme, avada, axon, discount-kit
  '/cdn.shopify.com/shopifycloud/',                  // privacy banner, web-pixels-manager
  '/shopifycloud/perf-kit',
  '/shopifycloud/shop-js',
  '/shopifycloud/storefront/assets/storefront/load_feature',
  '/shopifycloud/storefront-forms-hcaptcha',
  '/shopifycloud/privacy-banner',
  '/shopifycloud/portable-wallets',
  '/cdn/shopifycloud/perf-kit',
  '/cdn/shopifycloud/shop-js',
  '/cdn/shopifycloud/storefront/assets/storefront/load_feature',
  '/cdn/shopifycloud/privacy-banner',
  '/cdn/shopifycloud/portable-wallets',
  '/cdn/s/trekkie',
  '/cdn.506.io/',
  '/edge.marker.io/',
  '/js.hcaptcha.com/',
  '/checkouts/internal/preloads',
];

// Inline <script> ids that are pure third-party bootstraps
const EXTERNAL_SCRIPT_IDS = new Set([
  'captcha-bootstrap',
  'scb4127',
  '__st',
  'shopify-features',
  'shop-js-analytics',
  'sections-script',
  'web-pixels-manager-setup',
]);

function listHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listHtmlFiles(full));
    } else if (st.isFile() && entry.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function attrValue(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2] ?? '') : null;
}

function isExternalUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

function isThirdPartyAssetPath(url) {
  if (!url) return false;
  return THIRD_PARTY_PATH_PATTERNS.some((p) => url.includes(p));
}

function stripLinkTags(html, log) {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attrValue(tag, 'href');
    const rel = (attrValue(tag, 'rel') || '').toLowerCase();
    // Keep canonical / alternate hreflang — they're metadata, not fetched.
    if (/\b(?:canonical|alternate)\b/.test(rel)) return tag;
    if (isExternalUrl(href) || isThirdPartyAssetPath(href)) {
      log.linksRemoved++;
      return '';
    }
    return tag;
  });
}

function stripExternalScriptSrc(html, log) {
  return html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*["'][^>]*>\s*<\/script>/gi, (tag) => {
    const src = attrValue(tag, 'src');
    if (isExternalUrl(src) || isThirdPartyAssetPath(src)) {
      log.scriptSrcRemoved++;
      return '';
    }
    return tag;
  });
}

function stripInlineThirdPartyScripts(html, log) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, body) => {
    if (/\bsrc\s*=/i.test(attrs)) return full; // handled elsewhere
    const id = attrValue('<script' + attrs + '>', 'id') || '';
    if (EXTERNAL_SCRIPT_IDS.has(id)) {
      log.inlineScriptsRemoved++;
      return '';
    }
    const trimmed = body || '';
    if (!trimmed.trim()) return full;
    for (const needle of EXTERNAL_HOST_PATTERNS) {
      if (trimmed.includes(needle)) {
        log.inlineScriptsRemoved++;
        return '';
      }
    }
    return full;
  });
}

function neutralizeExternalMediaSrc(html, log) {
  // <img>, <iframe>, <source>, <video>, <audio>, <track>, <embed>
  return html.replace(/<(img|iframe|source|video|audio|track|embed)\b([^>]*)>/gi, (tag, name, attrs) => {
    const src = attrValue(tag, 'src');
    if (!isExternalUrl(src)) return tag;
    log.mediaSrcCleared++;
    const newAttrs = attrs.replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*')/i, 'src=""');
    return `<${name}${newAttrs}>`;
  });
}

async function processFile(file) {
  const original = await readFile(file, 'utf8');
  const log = {
    linksRemoved: 0,
    scriptSrcRemoved: 0,
    inlineScriptsRemoved: 0,
    mediaSrcCleared: 0,
  };
  let updated = original;
  updated = stripLinkTags(updated, log);
  updated = stripExternalScriptSrc(updated, log);
  updated = stripInlineThirdPartyScripts(updated, log);
  updated = neutralizeExternalMediaSrc(updated, log);
  if (updated !== original) {
    await writeFile(file, updated, 'utf8');
  }
  return log;
}

const files = listHtmlFiles(ROOT);
const totals = {linksRemoved: 0, scriptSrcRemoved: 0, inlineScriptsRemoved: 0, mediaSrcCleared: 0};
for (const file of files) {
  const log = await processFile(file);
  for (const k of Object.keys(totals)) totals[k] += log[k];
  const changed = Object.values(log).some(Boolean);
  if (changed) {
    console.log(file.replace(ROOT + '/', ''), log);
  }
}
console.log('---');
console.log('Files scanned:', files.length);
console.log('Totals:', totals);
