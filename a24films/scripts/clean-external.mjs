#!/usr/bin/env node
// Strip external (off-folder) asset references from every mirrored HTML page so
// the site is fully self-contained and triggers no third-party network requests
// at runtime.
//
// a24films.com is a Craft CMS site. Its off-host runtime calls come from:
//   - Adobe Typekit loader logic (the @font-face CSS is mirrored; the JS
//     fingerprint/async loader at use.typekit.net is stripped)
//   - www.google.com/jsapi (legacy Google loader)
//   - consent.a24films.com / cookie-consent beacons
//   - Klaviyo newsletter (manage.kmail-lists.com) form posts
//   - Facebook / Meta pixel, Google Analytics, segment, etc.
//
// What it removes / neutralizes:
//   - <link ...> whose href targets an external http(s):// host
//     (preconnect/dns-prefetch/preload/prefetch/modulepreload/stylesheet),
//     EXCEPT rel=canonical / alternate (metadata only, not fetched)
//   - <script src="http(s)://..."> tags
//   - inline <script> blocks that reference a known third-party service
//   - <img>/<iframe>/<source>/<video>/<audio>/<track>/<embed> src pointing
//     externally (src emptied so layout is preserved)
//
// What it intentionally leaves alone:
//   - <a href="https://...">  — user-clicked navigation (shop/app/social), not
//     a runtime dependency
//   - <link rel="canonical">  — metadata only

import {readFile, writeFile} from 'node:fs/promises';
import {readdirSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';

const ROOT = resolve('site');

// Mention of any of these inside an inline <script> marks it a third-party
// bootstrap → drop the whole block.
const EXTERNAL_HOST_PATTERNS = [
  'www.googletagmanager.com',
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'www.google.com/jsapi',
  'google.com/jsapi',
  'connect.facebook.net',
  'facebook.net',
  'fbq(',
  'fbevents',
  'gtag(',
  "gtag('config'",
  'dataLayer.push',
  'GoogleAnalyticsObject',
  'use.typekit.net',
  'typekit.com',
  'Typekit.load',
  'consent.a24films.com',
  'cookieconsent',
  'manage.kmail-lists.com',
  'kmail-lists.com',
  'klaviyo',
  '_learnq',
  'cdn.segment.com',
  'analytics.tiktok.com',
  'snap.licdn.com',
  'bat.bing.com',
  'static.ads-twitter.com',
];

// Path fragments that mark a (possibly locally-cached) script/style as a
// third-party module whose only purpose is to talk to an external service.
const THIRD_PARTY_PATH_PATTERNS = [
  // NOTE: do NOT list '/use.typekit.net/' here — the @font-face stylesheet is
  // mirrored locally (its @import/@font-face point at local woff2 files and it
  // makes zero external calls), so the rewritten <link href="/assets/
  // use.typekit.net/ewm3ygz.css"> must be KEPT. Typekit's async JS loader is
  // stripped separately via the inline-script patterns above.
  'googletagmanager.com',
  'google-analytics.com',
  'google.com/jsapi',
  '/consent.a24films.com/',
  'kmail-lists.com',
  'cdn.segment.com',
];

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

function isExternalUrl(url) {
  return /^(https?:)?\/\//i.test(url || '');
}

function isThirdPartyAssetPath(url) {
  if (!url) return false;
  return THIRD_PARTY_PATH_PATTERNS.some(p => url.includes(p));
}

function stripLinkTags(html, log) {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attrValue(tag, 'href');
    const rel = (attrValue(tag, 'rel') || '').toLowerCase();
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
    if (/\bsrc\s*=/i.test(attrs)) return full;
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
  const log = {linksRemoved: 0, scriptSrcRemoved: 0, inlineScriptsRemoved: 0, mediaSrcCleared: 0};
  let updated = original;
  updated = stripLinkTags(updated, log);
  updated = stripExternalScriptSrc(updated, log);
  updated = stripInlineThirdPartyScripts(updated, log);
  updated = neutralizeExternalMediaSrc(updated, log);
  if (updated !== original) await writeFile(file, updated, 'utf8');
  return log;
}

const files = listHtmlFiles(ROOT);
const totals = {linksRemoved: 0, scriptSrcRemoved: 0, inlineScriptsRemoved: 0, mediaSrcCleared: 0};
for (const file of files) {
  const log = await processFile(file);
  for (const k of Object.keys(totals)) totals[k] += log[k];
  if (Object.values(log).some(Boolean)) console.log(file.replace(ROOT + '/', ''), log);
}
console.log('---');
console.log('Files scanned:', files.length);
console.log('Totals:', totals);
