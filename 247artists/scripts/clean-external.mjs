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

// Hosts whose mention inside an inline <script> means "third-party loader".
// 247artists.com is a WordPress site; the only off-host runtime calls come
// from Google Tag Manager / GA, Microsoft Clarity, and the GoDaddy traffic
// tracking beacons served off img1.wsimg.com.
const EXTERNAL_HOST_PATTERNS = [
  'www.googletagmanager.com',
  'googletagmanager.com',
  'google-analytics.com',
  'www.google-analytics.com',
  'analytics.google.com',
  'www.clarity.ms',
  'scripts.clarity.ms',
  'clarity.ms',
  'img1.wsimg.com',
  'wsimg.com',
  'scc-c2',
  'tccl-tti',
  'connect.facebook.net',
  'analytics.tiktok.com',
  'bat.bing.com',
  'forms.hsforms.com',
  'forms-na1.hsforms.com',
  'hsforms.com',
  'js.hsforms.net',
  'hs-scripts.com',
  'hubspot',
  'gtag(',
  "gtag('config'",
  'dataLayer.push',
  'GoogleAnalyticsObject',
];

// Path fragments that mark a script/stylesheet as a third-party module —
// even when it's been cached into our local /assets/ folder, its only purpose
// is to talk to an external service. Match these and drop the tag.
const THIRD_PARTY_PATH_PATTERNS = [
  '/img1.wsimg.com/',
  '/signals/js/clients/scc-c2/',
  '/traffic-assets/js/tccl-tti',
  'googletagmanager.com',
  'google-analytics.com',
  'clarity.ms',
];

// Inline <script> ids that are pure third-party bootstraps
const EXTERNAL_SCRIPT_IDS = new Set([
  'google-tag-manager',
  'google_gtagjs',
  'wpr-lazyload-bg-exclusions',
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
  // Absolute (https://host) or protocol-relative (//host). Local mirror refs
  // are always rewritten to a single-slash absolute path ("/assets/...") or a
  // relative path, so any leading "//" is by definition off-host.
  return /^(https?:)?\/\//i.test(url || '');
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
