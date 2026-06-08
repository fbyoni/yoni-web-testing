import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {dirname, extname, join, relative, resolve} from 'node:path';
import {promisify} from 'node:util';

// Mirror the Shopify storefront at shop.247artists.com into the shared legacy/
// archive, served locally under the /shop/ route. Pages land in legacy/shop/...
// and assets in legacy/assets/<host>/...  All references are rewritten to
// server-absolute local paths (/shop/... for pages, /assets/<host>/... for
// assets) so depth never matters. `npm run deoptimize` then pretty-prints the
// whole archive (including /shop) into the served site/ directory.
//
// Cart / checkout / account stay dead at the static layer — the mock UX layer
// (shop-mock.js) intercepts those interactions client-side.

const ORIGIN = 'https://shop.247artists.com';
const OUT_DIR = resolve('legacy');
const PAGE_PREFIX = 'shop';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 247artists-local-mirror/1.0';
const MAX_ASSETS = 4000;
const FETCH_DELAY_MS = 100;
const execFileAsync = promisify(execFile);

const pageUrls = new Set();
const assetUrls = new Set();
const written = new Map();
const failed = [];
let assetCount = 0;

const staticExtensions = new Set([
  '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.map',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.webm', '.mov',
]);

const assetHostHints = [
  'shop.247artists.com',
  'cdn.shopify.com',
  'fonts.shopifycdn.com',
  'shopifycdn.com',
];

// Backend-only / dynamic Shopify paths to never crawl.
const blockedPathPrefixes = [
  '/cart', '/checkout', '/checkouts', '/account', '/apps', '/services',
  '/password', '/search', '/wpm@', '/.well-known', '/admin',
  '/recommendations', '/cdn/wpm', '/localization', '/policies',
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function normalizeUrl(raw, base = ORIGIN) {
  if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) {
    return null;
  }
  const cleaned = raw.trim().replace(/^url\(/, '').replace(/\)$/, '').replace(/^['"]|['"]$/g, '');
  if (!cleaned || cleaned.startsWith('data:') || cleaned.startsWith('blob:')) {
    return null;
  }
  try {
    const url = cleaned.startsWith('//') ? new URL(`https:${cleaned}`) : new URL(cleaned, base);
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function isBlocked(url) {
  if (url.origin !== ORIGIN) return false;
  const path = url.pathname;
  if (blockedPathPrefixes.some(p => path === p || path.startsWith(p))) return true;
  const q = url.search.toLowerCase();
  return q.includes('variant=') && false; // keep variant pages out of crawl set but allow base product
}

function isStaticUrl(url) {
  const ext = extname(url.pathname).toLowerCase();
  return staticExtensions.has(ext) ||
    url.hostname.includes('cdn.shopify.com') ||
    url.hostname.includes('shopifycdn.com') ||
    url.pathname.startsWith('/cdn/');
}

function isLikelyAssetHost(url) {
  return assetHostHints.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

function shouldDiscoverNestedAssets(url) {
  return url.origin === ORIGIN ||
    url.hostname.includes('cdn.shopify.com') ||
    url.hostname.endsWith('.shopifycdn.com');
}

function looksLikePage(url) {
  if (url.origin !== ORIGIN || isBlocked(url)) return false;
  const ext = extname(url.pathname).toLowerCase();
  if (staticExtensions.has(ext)) return false;
  return true;
}

function safeSegment(value) {
  return value
    .replace(/%/g, '_')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'index';
}

function pagePath(url) {
  if (url.pathname === '/') return join(OUT_DIR, PAGE_PREFIX, 'index.html');
  const parts = url.pathname.split('/').filter(Boolean).map(safeSegment);
  return join(OUT_DIR, PAGE_PREFIX, ...parts, 'index.html');
}

function inferExtension(ct) {
  if (ct.includes('text/css')) return '.css';
  if (ct.includes('javascript')) return '.js';
  if (ct.includes('json')) return '.json';
  if (ct.includes('xml')) return '.xml';
  if (ct.includes('image/svg')) return '.svg';
  if (ct.includes('image/png')) return '.png';
  if (ct.includes('image/jpeg')) return '.jpg';
  if (ct.includes('image/webp')) return '.webp';
  if (ct.includes('image/avif')) return '.avif';
  if (ct.includes('image/gif')) return '.gif';
  if (ct.includes('font/woff2')) return '.woff2';
  if (ct.includes('font/woff')) return '.woff';
  return '';
}

function assetPath(url, contentType = '') {
  const parts = url.pathname.split('/').filter(Boolean).map(safeSegment);
  let filename = parts.pop() || 'index';
  const ext = extname(filename) || inferExtension(contentType);
  if (ext && !filename.endsWith(ext)) filename += ext;
  return join(OUT_DIR, 'assets', safeSegment(url.hostname), ...parts, filename);
}

function localAbsPathFor(url) {
  if (isBlocked(url)) return null;
  let target;
  if (isStaticUrl(url)) {
    target = assetPath(url);
  } else if (looksLikePage(url)) {
    target = pagePath(url);
  } else {
    return null;
  }
  let rel = '/' + relative(OUT_DIR, target).replace(/\\/g, '/');
  if (rel.endsWith('/index.html')) rel = rel.slice(0, -'index.html'.length);
  return rel;
}

async function fetchBuffer(url) {
  await sleep(FETCH_DELAY_MS);
  const href = url instanceof URL ? url.href : String(url);
  const meta = await execFileAsync('curl', ['-L', '-sS', '--fail', '-A', USER_AGENT, '-o', '/dev/null', '-w', '%{content_type}', href], {maxBuffer: 1024 * 1024});
  const body = await execFileAsync('curl', ['-L', '-sS', '--fail', '-A', USER_AGENT, href], {encoding: 'buffer', maxBuffer: 80 * 1024 * 1024});
  return {buffer: body.stdout, contentType: String(meta.stdout || '')};
}

async function fetchText(url) {
  const {buffer} = await fetchBuffer(url);
  return buffer.toString('utf8');
}

function addPage(url) {
  if (looksLikePage(url)) pageUrls.add(url.href);
}
function addAsset(url) {
  if (!isBlocked(url) && assetCount < MAX_ASSETS) assetUrls.add(url.href);
}

function classifyAndAdd(raw, base, hint = '') {
  const url = normalizeUrl(raw, base);
  if (!url || isBlocked(url)) return;
  const lh = hint.toLowerCase();
  if (looksLikePage(url) && (lh === 'a' || lh === 'page')) { addPage(url); return; }
  const hintedAsset = ['src', 'srcset', 'poster', 'stylesheet', 'preload', 'url'].includes(lh);
  if (isStaticUrl(url) || (hintedAsset && (url.origin === ORIGIN || isLikelyAssetHost(url)))) {
    addAsset(url);
  } else if (looksLikePage(url)) {
    addPage(url);
  }
}

function collectReferences(text, base) {
  const sources = [text, text.replace(/\\\//g, '/')];
  for (const source of sources) {
    for (const m of source.matchAll(/<a\b[^>]*?\shref=["']([^"']+)["']/gi)) classifyAndAdd(m[1], base, 'a');
    for (const m of source.matchAll(/\s(?:src|poster|data-src)=["']([^"']+)["']/gi)) classifyAndAdd(m[1], base, 'src');
    for (const m of source.matchAll(/\shref=["']([^"']+)["']/gi)) {
      const raw = m[1];
      const hint = /\.(css|js|mjs|json|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf)(\?|$)/i.test(raw) ? 'stylesheet' : '';
      classifyAndAdd(raw, base, hint);
    }
    for (const m of source.matchAll(/\s(?:srcset|imagesrcset)=["']([^"']+)["']/gi)) {
      for (const part of m[1].split(',')) classifyAndAdd(part.trim().split(/\s+/)[0], base, 'srcset');
    }
    for (const m of source.matchAll(/url\(([^)]+)\)/gi)) classifyAndAdd(m[1], base, 'url');
    for (const m of source.matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)) {
      const u = normalizeUrl(m[0], base);
      classifyAndAdd(m[0], base, u && isStaticUrl(u) ? 'url' : '');
    }
    for (const m of source.matchAll(/\/\/[a-z0-9.-]+\/[^\s"'<>\\)]+/gi)) {
      const u = normalizeUrl(m[0], base);
      if (u && (isStaticUrl(u) || isLikelyAssetHost(u))) classifyAndAdd(m[0], base, 'url');
    }
  }
}

async function seed() {
  // Pull product / collection / page URLs from the storefront sitemap index.
  let index;
  try {
    index = await fetchText(ORIGIN + '/sitemap.xml');
  } catch {
    index = '';
  }
  const subs = [...index.matchAll(/<loc>(.*?)<\/loc>/g)]
    .map(m => m[1].replace(/&amp;/g, '&'))
    .filter(u => /sitemap_(products|collections|pages)/.test(u));
  for (const sub of subs) {
    let xml;
    try { xml = await fetchText(sub); } catch { continue; }
    for (const m of xml.matchAll(/<loc>(.*?)<\/loc>/g)) {
      const u = normalizeUrl(m[1].replace(/&amp;/g, '&'));
      if (!u) continue;
      if (looksLikePage(u)) addPage(u);
      else if (isStaticUrl(u)) addAsset(u);
    }
  }
  addPage(new URL(ORIGIN));
  addPage(new URL(ORIGIN + '/collections/all'));
}

async function writeDownloaded(url, target, buffer) {
  await mkdir(dirname(target), {recursive: true});
  await writeFile(target, buffer);
  written.set(url.href, target);
}

async function scrapePages() {
  for (let i = 0; i < [...pageUrls].length; i++) {
    const url = new URL([...pageUrls][i]);
    if (written.has(url.href) || isBlocked(url)) continue;
    try {
      const {buffer, contentType} = await fetchBuffer(url);
      if (!contentType.includes('text/html')) { addAsset(url); continue; }
      await writeDownloaded(url, pagePath(url), buffer);
      collectReferences(buffer.toString('utf8'), url.href);
      console.log(`page  ${url.href}`);
    } catch (e) {
      failed.push(`${url.href}: ${e.message}`);
    }
  }
}

async function scrapeAssets() {
  for (let i = 0; i < [...assetUrls].length; i++) {
    const url = new URL([...assetUrls][i]);
    if (written.has(url.href) || isBlocked(url)) continue;
    try {
      const {buffer, contentType} = await fetchBuffer(url);
      await writeDownloaded(url, assetPath(url, contentType), buffer);
      assetCount++;
      if (shouldDiscoverNestedAssets(url) && /text\/css|javascript|json|xml/.test(contentType)) {
        collectReferences(buffer.toString('utf8'), url.href);
      }
      console.log(`asset ${url.href}`);
    } catch (e) {
      failed.push(`${url.href}: ${e.message}`);
    }
  }
}

function isUrlish(value) {
  const t = value.trim();
  return /^(https?:)?\/\//i.test(t) || t.startsWith('/') || t.startsWith('./') || t.startsWith('../') ||
    /\.(css|js|mjs|json|xml|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|mp4|webm)(\?|#|$)/i.test(t);
}

function localPathFor(raw, base = ORIGIN) {
  const url = normalizeUrl(raw, base);
  if (!url) return raw;
  if (url.origin !== ORIGIN && !isLikelyAssetHost(url)) return raw;
  return localAbsPathFor(url) || raw;
}

function replaceUrlLike(value, base = ORIGIN) {
  if (!isUrlish(value)) return value;
  return localPathFor(value, base);
}

function rewriteContent(text, baseUrl = ORIGIN) {
  let out = text;
  out = out.replace(/((?:href|src|poster|action|content|data-src)=["'])([^"']+)(["'])/gi, (f, p, v, s) => `${p}${replaceUrlLike(v, baseUrl)}${s}`);
  out = out.replace(/((?:srcset|imagesrcset)=["'])([^"']+)(["'])/gi, (f, p, v, s) => {
    const r = v.split(',').map(part => {
      const pieces = part.trim().split(/\s+/);
      pieces[0] = replaceUrlLike(pieces[0], baseUrl);
      return pieces.join(' ');
    }).join(', ');
    return `${p}${r}${s}`;
  });
  // CSS url(...) — but ONLY at a word boundary, so we never match inside JS
  // identifiers like `new URL(` or `navigateToURL(`. Preserve the original
  // open-token case and only rewrite when the value is an actual URL that
  // changes, so non-URL constructs pass through byte-for-byte.
  out = out.replace(/(\burl\()([^)]+)(\))/gi, (full, open, v, close) => {
    const trimmed = v.trim();
    const quote = trimmed.startsWith('"') ? '"' : trimmed.startsWith("'") ? "'" : '';
    const clean = trimmed.replace(/^['"]|['"]$/g, '');
    if (!isUrlish(clean)) return full;
    const rewritten = replaceUrlLike(clean, baseUrl);
    if (rewritten === clean) return full;
    return `${open}${quote}${rewritten}${quote}${close}`;
  });
  // Origin URLs inside inline JS/JSON (Shopify config, product JSON, etc.)
  out = out.replace(/(https?:)?\/\/shop\.247artists\.com(\/[^\s"'<>\\)]*)?/gi, (match) => {
    const u = normalizeUrl(match, ORIGIN);
    if (!u || u.origin !== ORIGIN) return match;
    return localAbsPathFor(u) || match;
  });
  out = out.replace(/(https?:)?\\\/\\\/shop\.247artists\.com((?:\\\/[^"'\s<>\\]*)*)/gi, (match) => {
    const plain = match.replace(/\\\//g, '/');
    const u = normalizeUrl(plain, ORIGIN);
    if (!u || u.origin !== ORIGIN) return match;
    const local = localAbsPathFor(u);
    return local ? local.replace(/\//g, '\\/') : match;
  });
  return out;
}

async function walk(dir) {
  const entries = await readdir(dir, {withFileTypes: true});
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...await walk(p));
    else files.push(p);
  }
  return files;
}

function baseUrlForFile(file) {
  const rel = relative(OUT_DIR, file).replace(/\\/g, '/');
  if (rel.startsWith('assets/')) {
    const parts = rel.split('/');
    return `https://${parts[1]}/${parts.slice(2).join('/')}`;
  }
  if (rel.startsWith(PAGE_PREFIX + '/')) {
    const inner = rel.slice(PAGE_PREFIX.length + 1).replace(/index\.html$/, '');
    return `${ORIGIN}/${inner}`;
  }
  return ORIGIN + '/';
}

async function rewriteTextFiles() {
  // Only rewrite files this scraper produced (shop pages + mirrored assets),
  // never the existing 247artists WordPress pages already in legacy/.
  const targets = new Set(written.values());
  for (const file of targets) {
    const ext = extname(file).toLowerCase();
    if (!['.html', '.css', '.js', '.mjs', '.json', '.xml', '.svg'].includes(ext)) continue;
    const before = await readFile(file, 'utf8');
    const after = rewriteContent(before, baseUrlForFile(file));
    if (after !== before) await writeFile(file, after);
  }
}

async function main() {
  // Only clear the shop subtree; leave the rest of legacy/ (the WP mirror) intact.
  await rm(join(OUT_DIR, PAGE_PREFIX), {recursive: true, force: true});
  await mkdir(join(OUT_DIR, PAGE_PREFIX), {recursive: true});

  await seed();
  await scrapePages();
  await scrapeAssets();
  await scrapeAssets();
  await scrapeAssets();
  await rewriteTextFiles();

  const files = [...written.values()];
  const pages = files.filter(f => f.endsWith('index.html')).length;
  console.log(`\nDone. Wrote ${pages} shop pages and ${files.length - pages} assets.`);
  if (failed.length) {
    console.log(`\n${failed.length} URLs failed (first 30):`);
    for (const x of failed.slice(0, 30)) console.log('- ' + x);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
