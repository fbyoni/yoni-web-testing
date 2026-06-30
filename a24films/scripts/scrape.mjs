import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname, extname, join, relative, resolve} from 'node:path';
import {promisify} from 'node:util';

// ---------------------------------------------------------------------------
// a24films.com (Craft CMS) self-contained mirror.
//
// The site is server-rendered HTML with three asset origins:
//   - a24films.com           → /assets/css/app.css, /assets/js/app.js, icons
//   - *.transforms.svdcdn.com → image CDN; the QUERY STRING is a real transform
//                               (w=, fit=, auto=compress,format) so distinct
//                               query strings are distinct images — we keep a
//                               hash of the query in the on-disk filename.
//   - use.typekit.net / p.typekit.net → Adobe Typekit font CSS + woff2 files.
//
// HTML attributes encode `&` as `&amp;`; normalizeUrl() HTML-decodes first so
// the same canonical URL is used for discovery, fetching, and rewriting.
// ---------------------------------------------------------------------------

const ORIGIN = 'https://a24films.com';
const OUT_DIR = resolve('site');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 a24-local-mirror/1.0';
const MAX_ASSETS = 6000;
const FETCH_DELAY_MS = 80;
const execFileAsync = promisify(execFile);

const pageUrls = new Set();
const assetUrls = new Set();
const written = new Map();
const failed = [];
let assetCount = 0;

const staticExtensions = new Set([
  '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.md', '.webmanifest',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.webm', '.mov', '.m4v',
  '.pdf', '.vtt'
]);

// Hosts that serve real page assets we want mirrored under
// site/assets/<host>/...  Everything else (analytics, google jsapi, klaviyo,
// social, the shop/app/aaa24 subdomains) is left for clean-external / kept as
// outbound <a> links.
const assetHostHints = [
  'a24films.com',
  'use.typekit.net',
  'p.typekit.net',
  'atwenty-four.transforms.svdcdn.com',
  // Merch thumbnails embedded in the on-site shop carousels are served from
  // Shopify's CDN. They're real content images (not tracking), so mirror them
  // as local assets — the shop itself stays an outbound link to shop.a24films.com.
  'cdn.shopify.com',
];

// Page routes that may not be linked from the homepage but exist on the site.
const seedPaths = [
  '/',
  '/films',
  '/television',
  '/notes',
  '/docs',
  '/jobs',
  '/privacy-policy',
  '/terms-of-use',
];

// Backend-only / dynamic paths that must never be crawled.
const blockedPathPrefixes = [
  '/craft',
  '/cp',
  '/actions',
  '/admin',
  '/index.php',
  '/unsupported',
  '/_debugbar',
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function htmlDecode(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&#x0*26;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'");
}

function normalizeUrl(raw, base = ORIGIN) {
  if (!raw) return null;
  let s = raw.trim();
  if (!s || s.startsWith('#') || s.startsWith('mailto:') || s.startsWith('tel:') || s.startsWith('javascript:')) {
    return null;
  }
  s = htmlDecode(s).replace(/^url\(/, '').replace(/\)$/, '').replace(/^['"]|['"]$/g, '').trim();
  if (!s || s.startsWith('data:') || s.startsWith('blob:') || s.startsWith('#')) return null;
  try {
    const url = s.startsWith('//') ? new URL(`https:${s}`) : new URL(s, base);
    url.hash = '';
    // The site is served over https; normalize bare http:// links to the apex
    // (e.g. the "a24films.com" link in the privacy policy) so they're recognized
    // as the page origin rather than a separate http:// asset host.
    if (url.protocol === 'http:' && (url.hostname === 'a24films.com' || url.hostname === 'www.a24films.com')) {
      url.protocol = 'https:';
    }
    if (url.hostname === 'www.a24films.com') url.hostname = 'a24films.com';
    return url;
  } catch {
    return null;
  }
}

function isLikelyAssetHost(url) {
  // EXACT host match only. We must NOT subdomain-match a24films.com, or the
  // separate apps on shop./app./aaa24./screeningroom.a24films.com would be
  // pulled in as local assets — they are outbound links to other properties.
  return assetHostHints.includes(url.hostname);
}

function isBlocked(url) {
  if (url.origin !== ORIGIN) return false;
  const path = url.pathname;
  if (blockedPathPrefixes.some(p => path === p || path.startsWith(p + '/') || path.startsWith(p))) {
    return true;
  }
  // Junk routes harvested out of email-share / social-share links inside JS
  // (e.g. ".../the-annotated-waves-playlist&subject=A24Films.com%20-%20The").
  // Real a24 routes are clean lowercase slugs — reject any path carrying share
  // punctuation so we never crawl (or create bogus dirs for) these.
  if (/[&%= ,@'"()]/.test(decodeURIComponent(path).replace(/%20/g, ' '))) return true;
  if (/[&%= ,@'"()]/.test(path)) return true;
  // Share/consent/tracking query variants of otherwise-real pages.
  const q = url.search.toLowerCase();
  if (/(subject=|body=|share=|utm_|a24_consent|mc_cid|mc_eid|fbclid|gclid)/.test(q)) return true;
  return false;
}

function isStaticUrl(url) {
  const ext = extname(url.pathname).toLowerCase();
  if (staticExtensions.has(ext)) return true;
  // a24 assets live under /assets/ with extensions; svdcdn paths carry the ext.
  return url.pathname.startsWith('/assets/');
}

function looksLikePage(url) {
  if (url.origin !== ORIGIN || isBlocked(url)) return false;
  const ext = extname(url.pathname).toLowerCase();
  if (ext && staticExtensions.has(ext)) return false;
  return true;
}

function safeSegment(value) {
  return value
    .replace(/%/g, '_')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'index';
}

function shortHash(s) {
  return createHash('sha1').update(s).digest('hex').slice(0, 10);
}

function pagePath(url) {
  if (url.pathname === '/' || url.pathname === '') {
    return join(OUT_DIR, 'index.html');
  }
  const parts = url.pathname.split('/').filter(Boolean).map(safeSegment);
  return join(OUT_DIR, ...parts, 'index.html');
}

function inferExtension(contentType) {
  const ct = contentType.toLowerCase();
  if (ct.includes('text/css')) return '.css';
  if (ct.includes('javascript')) return '.js';
  if (ct.includes('json')) return ct.includes('manifest') ? '.webmanifest' : '.json';
  if (ct.includes('xml')) return '.xml';
  if (ct.includes('text/plain')) return '.txt';
  if (ct.includes('image/svg')) return '.svg';
  if (ct.includes('image/png')) return '.png';
  if (ct.includes('image/jpeg')) return '.jpg';
  if (ct.includes('image/webp')) return '.webp';
  if (ct.includes('image/avif')) return '.avif';
  if (ct.includes('image/gif')) return '.gif';
  if (ct.includes('image/x-icon') || ct.includes('image/vnd.microsoft.icon')) return '.ico';
  if (ct.includes('font/woff2') || ct.includes('woff2')) return '.woff2';
  if (ct.includes('font/woff') || ct.includes('application/font-woff')) return '.woff';
  if (ct.includes('font/ttf') || ct.includes('truetype')) return '.ttf';
  if (ct.includes('video/mp4')) return '.mp4';
  return '';
}

function assetPath(url, contentType = '') {
  const parts = url.pathname.split('/').filter(Boolean).map(safeSegment);
  let filename = parts.pop() || 'index';
  let ext = extname(filename) || inferExtension(contentType);

  // Non-origin asset hosts (svdcdn image transforms, typekit p.css) encode real
  // parameters in the query string — keep a stable hash so each distinct
  // transform maps to its own file. Origin assets use ?v= cache-busters that
  // point at identical bytes, so we drop the query there.
  const keepQuery = url.origin !== ORIGIN && url.search && url.search.length > 1;
  if (!ext) {
    // svdcdn paths always carry an extension; this only fires for odd cases.
    ext = inferExtension(contentType);
  }
  const base = ext && filename.toLowerCase().endsWith(ext.toLowerCase())
    ? filename.slice(0, filename.length - ext.length)
    : filename;
  if (keepQuery) {
    filename = `${base}__${shortHash(url.search)}${ext}`;
  } else {
    filename = `${base}${ext}`;
  }
  return join(OUT_DIR, 'assets', safeSegment(url.hostname), ...parts, filename);
}

// Server-absolute local path for a mirrored URL.
function localAbsPathFor(url) {
  if (isBlocked(url)) return null;
  let target;
  // Prefer the EXACT path we wrote to disk — this is authoritative and avoids
  // any guesswork about extensions for query-only/extensionless URLs (e.g.
  // Typekit font binaries served from ".../l?primer=...", which get a .woff2
  // suffix from their content-type at fetch time that assetPath() can't infer
  // again at rewrite time without the response).
  if (written.has(url.href)) {
    target = written.get(url.href);
  } else if (isStaticUrl(url) || (url.origin !== ORIGIN && isLikelyAssetHost(url))) {
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
  const meta = await execFileAsync('curl', [
    '-L', '-sS', '--fail', '--compressed',
    '--connect-timeout', '15', '--max-time', '45',
    '-A', USER_AGENT,
    '-H', 'Accept: text/html,application/xhtml+xml,image/avif,image/webp,*/*',
    '-o', '/dev/null', '-w', '%{content_type}', href
  ], {maxBuffer: 4 * 1024 * 1024});
  const body = await execFileAsync('curl', [
    '-L', '-sS', '--fail', '--compressed',
    '--connect-timeout', '15', '--max-time', '90',
    '-A', USER_AGENT,
    '-H', 'Accept: text/html,application/xhtml+xml,image/avif,image/webp,*/*',
    href
  ], {encoding: 'buffer', maxBuffer: 200 * 1024 * 1024});
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

  const h = hint.toLowerCase();
  if (looksLikePage(url) && (h === 'a' || h === 'page') && url.origin === ORIGIN) {
    addPage(url);
    return;
  }
  const hintedAsset = ['src', 'srcset', 'poster', 'stylesheet', 'preload', 'url'].includes(h);
  if (isStaticUrl(url) || (hintedAsset && (url.origin === ORIGIN || isLikelyAssetHost(url)))) {
    addAsset(url);
  } else if (looksLikePage(url) && url.origin === ORIGIN) {
    addPage(url);
  }
}

function collectReferences(text, base) {
  const sources = [text, text.replace(/\\\//g, '/')];
  for (const source of sources) {
    for (const m of source.matchAll(/<a\b[^>]*?\shref=["']([^"']+)["']/gi)) classifyAndAdd(m[1], base, 'a');
    for (const m of source.matchAll(/\s(?:src|data-src|data-lazy-src|data-bg|poster|data-poster)=["']([^"']+)["']/gi)) classifyAndAdd(m[1], base, 'src');
    for (const m of source.matchAll(/\shref=["']([^"']+)["']/gi)) {
      const raw = m[1];
      const hint = /\.(css|js|mjs|json|xml|txt|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|webmanifest)(\?|$)/i.test(htmlDecode(raw)) ? 'stylesheet' : '';
      classifyAndAdd(raw, base, hint);
    }
    for (const m of source.matchAll(/\s(?:srcset|imagesrcset|data-srcset|data-lazy-srcset)=["']([^"']+)["']/gi)) {
      for (const part of m[1].split(',')) classifyAndAdd(part.trim().split(/\s+/)[0], base, 'srcset');
    }
    for (const m of source.matchAll(/url\(([^)]+)\)/gi)) classifyAndAdd(m[1], base, 'url');
    for (const m of source.matchAll(/@import\s+["']([^"']+)["']/gi)) classifyAndAdd(m[1], base, 'url');
    for (const m of source.matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)) {
      const u = normalizeUrl(m[0], base);
      classifyAndAdd(m[0], base, u && isStaticUrl(u) ? 'url' : '');
    }
  }
}

async function writeDownloaded(url, target, buffer) {
  await mkdir(dirname(target), {recursive: true});
  await writeFile(target, buffer);
  written.set(url.href, target);
}

async function scrapePages() {
  // Iterate over a growing set: newly discovered pages get crawled too.
  let processed = 0;
  while (processed < pageUrls.size) {
    const href = [...pageUrls][processed++];
    const url = new URL(href);
    if (written.has(url.href) || isBlocked(url)) continue;
    const targetPath = pagePath(url);
    // Disk-based resume: a page already on disk (raw, un-rewritten) is reused —
    // we still parse it so discovery continues, but skip the network round-trip.
    if (existsSync(targetPath)) {
      try {
        const cached = await readFile(targetPath, 'utf8');
        collectReferences(cached, url.href);
        written.set(url.href, targetPath);
        continue;
      } catch {}
    }
    try {
      const {buffer, contentType} = await fetchBuffer(url);
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        addAsset(url);
        continue;
      }
      await writeDownloaded(url, pagePath(url), buffer);
      collectReferences(buffer.toString('utf8'), url.href);
      console.log(`page  ${url.href}`);
    } catch (e) {
      failed.push(`${url.href}: ${e.message}`);
    }
  }
}

async function scrapeAssets() {
  let processed = 0;
  while (processed < assetUrls.size) {
    const href = [...assetUrls][processed++];
    const url = new URL(href);
    if (written.has(url.href) || isBlocked(url)) continue;
    // Disk-based resume: assetPath is deterministic from the URL (incl. a hash
    // of the query for CDN transforms), so an existing file means we already
    // have these exact bytes. Reuse it; re-parse text assets for nested refs.
    const cachedTarget = assetPath(url);
    if (extname(cachedTarget) && existsSync(cachedTarget)) {
      written.set(url.href, cachedTarget);
      assetCount++;
      const ext = extname(cachedTarget).toLowerCase();
      if (['.css', '.js', '.mjs', '.json', '.xml', '.txt'].includes(ext)) {
        try { collectReferences(await readFile(cachedTarget, 'utf8'), url.href); } catch {}
      }
      continue;
    }
    try {
      const {buffer, contentType} = await fetchBuffer(url);
      const target = assetPath(url, contentType);
      await writeDownloaded(url, target, buffer);
      assetCount++;
      // Discover nested refs inside CSS/JS/JSON (typekit @import, font url()).
      if (/text\/css|javascript|json|xml|text\/plain/.test(contentType)) {
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
    /\.(css|js|mjs|json|xml|txt|md|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mov|pdf|webmanifest)(\?|#|$)/i.test(t);
}

function localPathFor(raw, base = ORIGIN) {
  const url = normalizeUrl(raw, base);
  if (!url) return raw;
  if (url.origin !== ORIGIN && !isLikelyAssetHost(url)) return raw;
  return localAbsPathFor(url) || raw;
}

// A value already rewritten to a local mirror path ("/assets/<mirrored-host>/…").
// Leaving these untouched makes rewriteContent idempotent, so re-running the
// rewrite over an already-processed file never double-prefixes the host segment.
// (Original a24 refs like "/assets/css/app.css" or "/assets/images/x.svg" do NOT
// match — their first segment is css/js/images/fonts, not a mirrored hostname —
// so those are still rewritten correctly.)
function isAlreadyLocalMirror(value) {
  const m = value.match(/^\/assets\/([^/]+)\//);
  return !!(m && assetHostHints.includes(m[1]));
}

function replaceUrlLike(value, base = ORIGIN) {
  if (isAlreadyLocalMirror(value)) return value;
  if (!isUrlish(htmlDecode(value))) return value;
  return localPathFor(value, base);
}

function rewriteContent(text, baseUrl = ORIGIN) {
  let out = text;

  out = out.replace(/((?:href|src|poster|action|data-src|data-lazy-src|data-bg|data-poster)=["'])([^"']+)(["'])/gi,
    (full, p, v, s) => `${p}${replaceUrlLike(v, baseUrl)}${s}`);

  out = out.replace(/((?:srcset|imagesrcset|data-srcset|data-lazy-srcset)=["'])([^"']+)(["'])/gi, (full, p, v, s) => {
    const rewritten = v.split(',').map(part => {
      const pieces = part.trim().split(/\s+/);
      pieces[0] = replaceUrlLike(pieces[0], baseUrl);
      return pieces.join(' ');
    }).join(', ');
    return `${p}${rewritten}${s}`;
  });

  out = out.replace(/(\burl\()([^)]+)(\))/gi, (full, open, v, close) => {
    const trimmed = v.trim();
    const quote = trimmed.startsWith('"') ? '"' : trimmed.startsWith("'") ? "'" : '';
    const clean = trimmed.replace(/^['"]|['"]$/g, '');
    if (!isUrlish(htmlDecode(clean))) return full;
    const rewritten = replaceUrlLike(clean, baseUrl);
    if (rewritten === clean) return full;
    return `${open}${quote}${rewritten}${quote}${close}`;
  });

  out = out.replace(/@import\s+(["'])([^"']+)(["'])/gi, (full, q1, v, q2) => {
    const rewritten = replaceUrlLike(v, baseUrl);
    return `@import ${q1}${rewritten}${q2}`;
  });

  // Catch-all for full origin/CDN URLs living inside inline JS / JSON islands.
  const hostAlt = assetHostHints.map(h => h.replace(/\./g, '\\.')).join('|');
  const plainRe = new RegExp(`(https?:)?\\/\\/(?:${hostAlt})\\/(?:&amp;|[^\\s"'<>\\\\)])*`, 'gi');
  out = out.replace(plainRe, (match) => {
    const u = normalizeUrl(match, baseUrl);
    if (!u) return match;
    return localAbsPathFor(u) || match;
  });

  // JSON-escaped origin URLs: https:\/\/a24films.com\/...
  const escRe = new RegExp(`(https?:)?\\\\\\/\\\\\\/(?:${hostAlt})((?:\\\\\\/[^"'\\s<>\\\\]*)*)`, 'gi');
  out = out.replace(escRe, (match) => {
    const plain = match.replace(/\\\//g, '/');
    const u = normalizeUrl(plain, baseUrl);
    if (!u) return match;
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
    const host = parts[1];
    const path = parts.slice(2).join('/');
    return `https://${host}/${path}`;
  }
  const pagePart = rel.replace(/index\.html$/, '');
  return `${ORIGIN}/${pagePart}`;
}

async function rewriteTextFiles() {
  const files = await walk(OUT_DIR);
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.md', '.svg', '.webmanifest'].includes(ext)) continue;
    const before = await readFile(file, 'utf8');
    const after = rewriteContent(before, baseUrlForFile(file));
    if (after !== before) await writeFile(file, after);
  }
}

async function main() {
  await mkdir(OUT_DIR, {recursive: true});

  for (const p of seedPaths) addPage(new URL(ORIGIN + p));

  // Pass 1: crawl seed + homepage-discovered pages, then assets they reference.
  await scrapePages();
  await scrapeAssets();
  // Newly fetched CSS/JS may reference more pages/assets (typekit @import etc.).
  await scrapePages();
  await scrapeAssets();
  await scrapeAssets();

  await rewriteTextFiles();

  const files = await walk(OUT_DIR);
  const pages = files.filter(f => f.endsWith('index.html')).length;
  console.log(`\nDone. ${pages} HTML pages, ${files.length - pages} assets written to ${OUT_DIR}.`);
  if (failed.length) {
    console.log(`\n${failed.length} URLs failed:`);
    for (const f of failed.slice(0, 60)) console.log(`- ${f}`);
    if (failed.length > 60) console.log(`- ...and ${failed.length - 60} more`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
