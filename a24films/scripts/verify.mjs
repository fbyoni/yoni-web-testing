#!/usr/bin/env node
// Offline-completeness verifier. For a representative set of pages it:
//   1. extracts every asset reference (src / href / srcset / CSS url()),
//   2. flags any that still point at an external http(s) host,
//   3. curls every LOCAL reference against the running server and reports any
//      that don't return 200 (a missing mirrored asset).
// Also recurses one level into referenced local CSS files (fonts live there).
//
// Usage: node scripts/verify.mjs   (server must be running; PORT env honoured)

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';

const execFileAsync = promisify(execFile);
const PORT = process.env.PORT || 5173;
const BASE = `http://localhost:${PORT}`;
const SITE = resolve('site');

// Representative sample across every page type, plus a deep crawl option.
const SAMPLE = [
  '/', '/films', '/television', '/notes', '/docs', '/jobs',
  '/privacy-policy', '/terms-of-use',
  '/films/backrooms', '/films/marty-supreme', '/films/eternity',
  '/notes/2026/06/both-peninsulas-with-lee-sung-jin-david-chase',
];

const ALL = process.argv.includes('--all');

function listHtml(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listHtml(full));
    else if (e.endsWith('.html')) out.push('/' + full.slice(SITE.length + 1).replace(/index\.html$/, ''));
  }
  return out;
}

function extractRefs(text) {
  const refs = new Set();
  for (const m of text.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) refs.add(m[1]);
  for (const m of text.matchAll(/(?:srcset|imagesrcset)=["']([^"']+)["']/gi)) {
    for (const part of m[1].split(',')) refs.add(part.trim().split(/\s+/)[0]);
  }
  for (const m of text.matchAll(/url\(([^)]+)\)/gi)) refs.add(m[1].trim().replace(/^['"]|['"]$/g, ''));
  return [...refs].filter(Boolean);
}

function isExternal(u) {
  return /^(https?:)?\/\//i.test(u);
}
function isLocalAsset(u) {
  return u.startsWith('/') && !u.startsWith('//') && !u.startsWith('/#');
}

async function head(url) {
  try {
    const {stdout} = await execFileAsync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '20', url]);
    return stdout.trim();
  } catch {
    return 'ERR';
  }
}

const pages = ALL ? listHtml(SITE) : SAMPLE;
const externalRefs = new Map();   // ref -> [pages]
const brokenLocal = new Map();    // ref -> code
const checkedLocal = new Set();
let localOk = 0;

for (const page of pages) {
  let html;
  try {
    const {stdout} = await execFileAsync('curl', ['-sS', '--max-time', '20', BASE + page], {maxBuffer: 64 * 1024 * 1024});
    html = stdout;
  } catch {
    brokenLocal.set(page + ' (PAGE)', 'fetch-failed');
    continue;
  }
  for (const ref of extractRefs(html)) {
    if (ref.startsWith('data:') || ref.startsWith('mailto:') || ref.startsWith('tel:') || ref.startsWith('#') || ref.startsWith('javascript:')) continue;
    if (isExternal(ref)) {
      // ignore outbound <a> nav by only counting asset-y external refs
      if (/\.(css|js|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|mp4)(\?|$)/i.test(ref) || /typekit|svdcdn|cloudfront|shopify/i.test(ref)) {
        if (!externalRefs.has(ref)) externalRefs.set(ref, []);
        externalRefs.get(ref).push(page);
      }
      continue;
    }
    if (isLocalAsset(ref) && !checkedLocal.has(ref)) {
      checkedLocal.add(ref);
      const code = await head(BASE + ref);
      if (code === '200') {
        localOk++;
        // Recurse into local CSS to verify fonts/nested url() resolve.
        if (/\.css(\?|$)/i.test(ref)) {
          try {
            const {stdout: css} = await execFileAsync('curl', ['-sS', '--max-time', '20', BASE + ref], {maxBuffer: 32 * 1024 * 1024});
            for (const sub of extractRefs(css)) {
              if (isLocalAsset(sub) && !checkedLocal.has(sub)) {
                checkedLocal.add(sub);
                const c2 = await head(BASE + sub);
                if (c2 === '200') localOk++; else brokenLocal.set(sub, c2 + ` (via ${ref})`);
              } else if (isExternal(sub)) {
                if (!externalRefs.has(sub)) externalRefs.set(sub, []);
                externalRefs.get(sub).push(ref);
              }
            }
          } catch {}
        }
      } else {
        brokenLocal.set(ref, code);
      }
    }
  }
}

console.log(`\nPages checked:            ${pages.length}`);
console.log(`Local assets OK (200):    ${localOk}`);
console.log(`Local assets BROKEN:      ${brokenLocal.size}`);
console.log(`External asset refs left: ${externalRefs.size}`);

if (brokenLocal.size) {
  console.log('\n--- BROKEN LOCAL (missing mirrored asset) ---');
  for (const [ref, code] of brokenLocal) console.log(`  [${code}] ${ref}`);
}
if (externalRefs.size) {
  console.log('\n--- EXTERNAL ASSET REFS STILL PRESENT ---');
  for (const [ref, where] of externalRefs) console.log(`  ${ref}\n      on: ${where.slice(0, 3).join(', ')}${where.length > 3 ? ` (+${where.length - 3})` : ''}`);
}
if (!brokenLocal.size && !externalRefs.size) {
  console.log('\n✅ All sampled pages are fully self-contained — every asset resolves locally, no external asset refs.');
}
