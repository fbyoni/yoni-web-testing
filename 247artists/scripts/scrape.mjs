import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {dirname, extname, join, relative, resolve} from 'node:path';
import {promisify} from 'node:util';

const ORIGIN = 'https://247artists.com';
const OUT_DIR = resolve('site');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 247artists-local-mirror/1.0';
const MAX_ASSETS = 3000;
const FETCH_DELAY_MS = 100;
const execFileAsync = promisify(execFile);

const pageUrls = new Set();
const assetUrls = new Set();
const written = new Map();
const failed = [];
let assetCount = 0;

const staticExtensions = new Set([
  '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.md',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.webm', '.mov',
  '.pdf', '.atom', '.oembed', '.kml'
]);

// Hosts that serve real page assets (CSS/JS/img/fonts) we want mirrored as
// path prefixes under site/assets/<host>/...  Everything on 247artists.com is
// self-hosted; the third-party hosts (GTM, clarity.ms, img1.wsimg.com) are
// analytics/tracking that we deliberately do NOT mirror — they are stripped in
// clean-external.mjs. Listing only the origin keeps the crawl tight.
const assetHostHints = [
  '247artists.com',
];

// Backend-only / dynamic paths that should never be crawled.
const blockedPathPrefixes = [
  '/wp-admin',
  '/wp-login.php',
  '/wp-json',
  '/xmlrpc.php',
  '/wp-content/cache',
  '/feed',
  '/comments',
  '/cart',
  '/checkout',
  '/my-account',
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  if (url.origin !== ORIGIN) {
    return false;
  }

  const path = url.pathname;
  if (blockedPathPrefixes.some(prefix => path === prefix || path.startsWith(prefix))) {
    return true;
  }

  // Drop crawl artifacts: a bare single-letter trailing segment (e.g. ".../t")
  // is never a real page or asset here — it comes from a string-concatenation
  // boundary in minified JS and resolves to the site's soft-404 page.
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1] || '';
  if (/^[a-z]$/i.test(last)) {
    return true;
  }

  // Skip query-paginated / comment-reply style URLs that aren't real pages.
  const query = url.search.toLowerCase();
  return query.includes('replytocom') ||
    query.includes('add-to-cart') ||
    query.includes('orderby');
}

function isStaticUrl(url) {
  const ext = extname(url.pathname).toLowerCase();
  return staticExtensions.has(ext) ||
    url.pathname.startsWith('/wp-content/') ||
    url.pathname.startsWith('/wp-includes/');
}

function isLikelyAssetHost(url) {
  return assetHostHints.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

function shouldDiscoverNestedAssets(url) {
  return url.origin === ORIGIN;
}

function looksLikePage(url) {
  if (url.origin !== ORIGIN || isBlocked(url)) {
    return false;
  }
  const ext = extname(url.pathname).toLowerCase();
  if (staticExtensions.has(ext)) {
    return false;
  }
  return true;
}

function safeSegment(value) {
  return value
    .replace(/%/g, '_')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'index';
}

function pagePath(url) {
  if (url.pathname === '/') {
    return join(OUT_DIR, 'index.html');
  }
  const parts = url.pathname.split('/').filter(Boolean).map(safeSegment);
  return join(OUT_DIR, ...parts, 'index.html');
}

function inferExtension(contentType) {
  if (contentType.includes('text/css')) return '.css';
  if (contentType.includes('javascript')) return '.js';
  if (contentType.includes('json')) return '.json';
  if (contentType.includes('xml')) return '.xml';
  if (contentType.includes('text/plain')) return '.txt';
  if (contentType.includes('image/svg')) return '.svg';
  if (contentType.includes('image/png')) return '.png';
  if (contentType.includes('image/jpeg')) return '.jpg';
  if (contentType.includes('image/webp')) return '.webp';
  if (contentType.includes('image/avif')) return '.avif';
  if (contentType.includes('image/gif')) return '.gif';
  if (contentType.includes('font/woff2')) return '.woff2';
  if (contentType.includes('font/woff')) return '.woff';
  if (contentType.includes('font/ttf')) return '.ttf';
  return '';
}

function assetPath(url, contentType = '') {
  // Mirror by pathname only. Query strings on this WP site are cache-busters
  // (?ver= on static links, ?_t= on JS-loaded ones) that point at identical
  // bytes — and the static server ignores the query — so we deliberately drop
  // it from the on-disk filename. That makes a single file resolve for every
  // cache-buster variant the runtime might request.
  const parts = url.pathname.split('/').filter(Boolean).map(safeSegment);
  let filename = parts.pop() || 'index';
  const ext = extname(filename) || inferExtension(contentType);
  if (ext && !filename.endsWith(ext)) {
    filename += ext;
  }
  return join(OUT_DIR, 'assets', safeSegment(url.hostname), ...parts, filename);
}

// Server-absolute local path ("/assets/..." or a clean "/page/") for a mirrored
// origin URL. Absolute paths are depth-independent and — unlike the old
// relative-substring rewrite — never clobber a longer URL that merely shares a
// prefix with the site root.
function localAbsPathFor(url) {
  if (isBlocked(url)) return null;
  let target;
  // Asset-ness wins over page-ness: a /wp-content/... or /wp-includes/... URL
  // is always a mirrored file, even when it has no extension (e.g. the theme
  // dir that window.plr.tpl_dir points at). Checking looksLikePage first would
  // wrongly treat such directories as HTML pages.
  if (isStaticUrl(url)) {
    target = assetPath(url);
  } else if (looksLikePage(url)) {
    target = pagePath(url);
  } else {
    return null;
  }
  let rel = '/' + relative(OUT_DIR, target).replace(/\\/g, '/');
  if (rel.endsWith('/index.html')) {
    rel = rel.slice(0, -'index.html'.length); // clean dir URL: "/about-us/"
  }
  return rel;
}

async function fetchBuffer(url) {
  await sleep(FETCH_DELAY_MS);
  const href = url instanceof URL ? url.href : String(url);
  const meta = await execFileAsync('curl', [
    '-L',
    '-sS',
    '--fail',
    '-A', USER_AGENT,
    '-o', '/dev/null',
    '-w', '%{content_type}',
    href
  ], {maxBuffer: 1024 * 1024});
  const body = await execFileAsync('curl', [
    '-L',
    '-sS',
    '--fail',
    '-A', USER_AGENT,
    href
  ], {
    encoding: 'buffer',
    maxBuffer: 80 * 1024 * 1024
  });

  return {buffer: body.stdout, contentType: String(meta.stdout || ''), finalUrl: href};
}

async function fetchText(url) {
  const {buffer} = await fetchBuffer(url);
  return buffer.toString('utf8');
}

function addPage(url) {
  if (looksLikePage(url)) {
    pageUrls.add(url.href);
  }
}

function addAsset(url) {
  if (!isBlocked(url) && assetCount < MAX_ASSETS) {
    assetUrls.add(url.href);
  }
}

function classifyAndAdd(raw, base, hint = '') {
  const url = normalizeUrl(raw, base);
  if (!url || isBlocked(url)) {
    return;
  }

  const lowerHint = hint.toLowerCase();
  if (looksLikePage(url) && (lowerHint === 'a' || lowerHint === 'page')) {
    addPage(url);
    return;
  }

  const hintedAsset = ['src', 'srcset', 'poster', 'stylesheet', 'preload', 'url'].includes(lowerHint);
  if (isStaticUrl(url) || (hintedAsset && (url.origin === ORIGIN || isLikelyAssetHost(url)))) {
    addAsset(url);
  } else if (looksLikePage(url)) {
    addPage(url);
  }
}

function collectReferences(text, base) {
  const sources = [text, text.replace(/\\\//g, '/')];

  for (const source of sources) {
    for (const match of source.matchAll(/<a\b[^>]*?\shref=["']([^"']+)["']/gi)) {
      classifyAndAdd(match[1], base, 'a');
    }

    for (const match of source.matchAll(/\s(?:src|poster|data-src|data-poster|data-lazy-src|data-bg)=["']([^"']+)["']/gi)) {
      classifyAndAdd(match[1], base, 'src');
    }

    for (const match of source.matchAll(/\shref=["']([^"']+)["']/gi)) {
      const raw = match[1];
      const hint = /\.(css|js|mjs|json|xml|txt|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf)(\?|$)/i.test(raw) ? 'stylesheet' : '';
      classifyAndAdd(raw, base, hint);
    }

    for (const match of source.matchAll(/\s(?:srcset|imagesrcset|data-srcset|data-lazy-srcset)=["']([^"']+)["']/gi)) {
      for (const part of match[1].split(',')) {
        classifyAndAdd(part.trim().split(/\s+/)[0], base, 'srcset');
      }
    }

    for (const match of source.matchAll(/url\(([^)]+)\)/gi)) {
      classifyAndAdd(match[1], base, 'url');
    }

    for (const match of source.matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)) {
      const u = normalizeUrl(match[0], base);
      classifyAndAdd(match[0], base, u && isStaticUrl(u) ? 'url' : '');
    }

    for (const match of source.matchAll(/\/\/[a-z0-9.-]+\/[^\s"'<>\\)]+/gi)) {
      const url = normalizeUrl(match[0], base);
      if (url && (isStaticUrl(url) || isLikelyAssetHost(url))) {
        classifyAndAdd(match[0], base, 'url');
      }
    }
  }
}

async function seedFromSitemaps() {
  // Rank Math serves a sitemap index; plain /sitemap.xml 301-redirects to it.
  const candidates = ['/sitemap_index.xml', '/sitemap.xml'];
  const expanded = new Set();
  for (const candidate of candidates) {
    let root;
    try {
      root = await fetchText(ORIGIN + candidate);
    } catch {
      continue;
    }
    const locs = [...root.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
    for (const loc of locs) {
      if (expanded.has(loc)) continue;
      expanded.add(loc);
      const url = normalizeUrl(loc);
      if (!url) continue;
      if (/sitemap.*\.xml$/i.test(url.pathname)) {
        // Nested sitemap → fetch and expand.
        let xml;
        try {
          xml = await fetchText(loc);
        } catch {
          continue;
        }
        for (const m of xml.matchAll(/<loc>(.*?)<\/loc>/g)) {
          const inner = m[1].replace(/&amp;/g, '&');
          const u = normalizeUrl(inner);
          if (!u) continue;
          if (looksLikePage(u)) addPage(u);
          else if (isStaticUrl(u)) addAsset(u);
        }
        collectReferences(xml, loc);
      } else if (looksLikePage(url)) {
        addPage(url);
      } else if (isStaticUrl(url)) {
        addAsset(url);
      }
    }
  }

  addPage(new URL(ORIGIN));
}

async function writeDownloaded(url, target, buffer) {
  await mkdir(dirname(target), {recursive: true});
  await writeFile(target, buffer);
  written.set(url.href, target);
}

async function scrapePages() {
  for (let index = 0; index < [...pageUrls].length; index++) {
    const href = [...pageUrls][index];
    const url = new URL(href);
    if (written.has(url.href) || isBlocked(url)) continue;

    try {
      const {buffer, contentType} = await fetchBuffer(url);
      if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('markdown')) {
        addAsset(url);
        continue;
      }
      await writeDownloaded(url, pagePath(url), buffer);
      collectReferences(buffer.toString('utf8'), url.href);
      console.log(`page  ${url.href}`);
    } catch (error) {
      failed.push(`${url.href}: ${error.message}`);
    }
  }
}

async function scrapeAssets() {
  for (let index = 0; index < [...assetUrls].length; index++) {
    const href = [...assetUrls][index];
    const url = new URL(href);
    if (written.has(url.href) || isBlocked(url)) continue;

    try {
      const {buffer, contentType} = await fetchBuffer(url);
      const target = assetPath(url, contentType);
      await writeDownloaded(url, target, buffer);
      assetCount++;
      if (shouldDiscoverNestedAssets(url) && /text\/css|javascript|json|xml|text\/plain/.test(contentType)) {
        collectReferences(buffer.toString('utf8'), url.href);
      }
      console.log(`asset ${url.href}`);
    } catch (error) {
      failed.push(`${url.href}: ${error.message}`);
    }
  }
}

function localPathFor(raw, base = ORIGIN) {
  const url = normalizeUrl(raw, base);
  if (!url) {
    return raw;
  }
  // Only rewrite same-origin / mirrored-asset-host URLs. Everything else
  // (social links, subdomains, third-party hosts) is left for clean-external.
  if (url.origin !== ORIGIN && !isLikelyAssetHost(url)) {
    return raw;
  }
  const local = localAbsPathFor(url);
  return local || raw;
}

function replaceUrlLike(value, base = ORIGIN) {
  if (!isUrlish(value)) {
    return value;
  }
  return localPathFor(value, base);
}

function isUrlish(value) {
  const trimmed = value.trim();
  return /^(https?:)?\/\//i.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    /\.(css|js|mjs|json|xml|txt|md|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mov|pdf|atom|oembed)(\?|#|$)/i.test(trimmed);
}

function rewriteContent(text, baseUrl = ORIGIN) {
  let out = text;

  out = out.replace(/((?:href|src|poster|action|content|data-src|data-poster|data-lazy-src|data-bg)=["'])([^"']+)(["'])/gi, (full, prefix, value, suffix) => {
    return `${prefix}${replaceUrlLike(value, baseUrl)}${suffix}`;
  });

  out = out.replace(/((?:srcset|imagesrcset|data-srcset|data-lazy-srcset)=["'])([^"']+)(["'])/gi, (full, prefix, value, suffix) => {
    const rewritten = value.split(',').map(part => {
      const trimmed = part.trim();
      const pieces = trimmed.split(/\s+/);
      pieces[0] = replaceUrlLike(pieces[0], baseUrl);
      return pieces.join(' ');
    }).join(', ');
    return `${prefix}${rewritten}${suffix}`;
  });

  out = out.replace(/url\(([^)]+)\)/gi, (full, value) => {
    const quote = value.trim().startsWith('"') ? '"' : value.trim().startsWith("'") ? "'" : '';
    const clean = value.trim().replace(/^['"]|['"]$/g, '');
    const rewritten = replaceUrlLike(clean, baseUrl);
    return `url(${quote}${rewritten}${quote})`;
  });

  // --- Catch-all for URLs living inside inline JS / JSON islands (Rank Math
  // schema, window.plr config, related-post data, etc.) that the attribute
  // passes never see. We map the FULL captured path of every origin URL to its
  // local absolute path. Crucially this is a per-URL mapping, not a substring
  // split, so a longer URL is never corrupted by a shorter prefix match. ---

  // 1. Plain origin URLs: https://247artists.com/..., //247artists.com/...
  out = out.replace(/(https?:)?\/\/247artists\.com(\/[^\s"'<>\\)]*)?/gi, (match) => {
    const u = normalizeUrl(match, ORIGIN);
    if (!u || u.origin !== ORIGIN) return match;
    return localAbsPathFor(u) || match;
  });

  // 2. JSON-escaped origin URLs: https:\/\/247artists.com\/...
  out = out.replace(/(https?:)?\\\/\\\/247artists\.com((?:\\\/[^"'\s<>\\]*)*)/gi, (match) => {
    const plain = match.replace(/\\\//g, '/');
    const u = normalizeUrl(plain, ORIGIN);
    if (!u || u.origin !== ORIGIN) return match;
    const local = localAbsPathFor(u);
    return local ? local.replace(/\//g, '\\/') : match;
  });

  // 3. Root-relative asset refs inside inline JS/CSS: "/wp-content/...",
  //    '/wp-includes/...'  →  mirrored asset path. (Attribute values are
  //    already handled above; this targets string literals in scripts.)
  out = out.replace(/(["'(=])\/(wp-content|wp-includes)\/([^"'\s)]*)/gi, (match, lead, base, rest) => {
    const u = normalizeUrl(`/${base}/${rest}`, ORIGIN);
    if (!u) return match;
    const local = localAbsPathFor(u);
    return local ? `${lead}${local}` : match;
  });

  return out;
}

async function walk(dir) {
  const entries = await readdir(dir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

// The creatorspc theme is a webpack build that loads ~30 lazy JS chunks and a
// set of per-section CSS files at runtime — none of which appear as literal
// links in the HTML. The chunk id→hash manifest lives inside main.js; the CSS
// names live in each page's inline `window.plr.bundles`. Mirror both so the
// runtime's publicPath / tpl_dir lookups all resolve locally.

async function fetchThemeChunks() {
  const jsDir = join(OUT_DIR, 'assets', '247artists.com', 'wp-content', 'themes', 'creatorspc', 'build', 'js');
  let files = [];
  try {
    files = await readdir(jsDir);
  } catch {
    return;
  }
  const mainFile = files.find(f => /^main(\.|__|$)/.test(f));
  if (!mainFile) return;

  const src = await readFile(join(jsDir, mainFile), 'utf8');
  const map = src.match(/\.u=e=>"js\/"\+e\+"-"\+(\{[\s\S]*?\})\[e\]/);
  if (!map) return;
  // The webpack chunk map uses unquoted numeric keys ({272:"hash",...}) so it
  // is not valid JSON — pull the id→hash pairs out with a regex instead.
  const chunks = {};
  for (const pair of map[1].matchAll(/(\d+):"([0-9a-f]+)"/g)) {
    chunks[pair[1]] = pair[2];
  }

  for (const [id, hash] of Object.entries(chunks)) {
    const url = new URL(`${ORIGIN}/wp-content/themes/creatorspc/build/js/${id}-${hash}.js`);
    const target = assetPath(url);
    try {
      const {buffer} = await fetchBuffer(url);
      await writeDownloaded(url, target, buffer);
      collectReferences(buffer.toString('utf8'), url.href);
      console.log(`chunk ${url.href}`);
    } catch (error) {
      failed.push(`${url.href}: ${error.message}`);
    }
  }
}

async function fetchDynamicCss() {
  // Gather every component/layout name flagged with "css":true across all
  // pages' inline window.plr.bundles config, plus every component referenced in
  // the theme JS module maps, then fetch build/css/components/<name>.css for
  // each. We scan with a tolerant regex rather than JSON.parse — the bundles
  // object is large minified JSON embedded mid-script and not cleanly
  // delimited. Names that turn out to be layouts (not components) simply 404 on
  // fetch and are skipped.
  const names = new Set();
  const pages = (await walk(OUT_DIR)).filter(f => f.endsWith('.html'));
  for (const page of pages) {
    const html = await readFile(page, 'utf8');
    for (const m of html.matchAll(/"([a-z0-9-]+)":\{[^{}]*"css":\s*true/gi)) {
      names.add(m[1]);
    }
  }

  // main.js component module map: "./components/<name>/..."
  const jsDir = join(OUT_DIR, 'assets', '247artists.com', 'wp-content', 'themes', 'creatorspc', 'build', 'js');
  try {
    const jsFiles = await readdir(jsDir);
    for (const f of jsFiles.filter(f => f.endsWith('.js'))) {
      const src = await readFile(join(jsDir, f), 'utf8');
      for (const cm of src.matchAll(/\.\/components\/([a-z0-9-]+)\//gi)) {
        names.add(cm[1]);
      }
    }
  } catch {}

  for (const name of names) {
    const url = new URL(`${ORIGIN}/wp-content/themes/creatorspc/build/css/components/${name}.css`);
    const target = assetPath(url);
    if (written.has(url.href)) continue;
    try {
      const {buffer} = await fetchBuffer(url);
      await writeDownloaded(url, target, buffer);
      collectReferences(buffer.toString('utf8'), url.href);
      console.log(`css   ${url.href}`);
    } catch (error) {
      failed.push(`${url.href}: ${error.message}`);
    }
  }
}

// Reconstruct the original live URL a mirrored file came from, so relative
// references inside it (e.g. gellix.css's url('./gellix/x.woff2')) resolve
// against the correct directory rather than the site root.
function baseUrlForFile(file) {
  const rel = relative(OUT_DIR, file).replace(/\\/g, '/');
  if (rel.startsWith('assets/')) {
    const parts = rel.split('/');
    const host = parts[1];
    const path = parts.slice(2).join('/');
    return `https://${host}/${path}`;
  }
  // A page: site/<segs>/index.html → https://247artists.com/<segs>/
  const pagePathPart = rel.replace(/index\.html$/, '');
  return `${ORIGIN}/${pagePathPart}`;
}

async function rewriteTextFiles() {
  const files = await walk(OUT_DIR);
  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (!['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.md', '.svg'].includes(extension)) {
      continue;
    }
    const before = await readFile(file, 'utf8');
    const after = rewriteContent(before, baseUrlForFile(file));
    if (after !== before) {
      await writeFile(file, after);
    }
  }
}

async function main() {
  await rm(OUT_DIR, {recursive: true, force: true});
  await mkdir(OUT_DIR, {recursive: true});

  await seedFromSitemaps();
  await scrapePages();
  await scrapeAssets();
  await scrapeAssets();
  await fetchThemeChunks();
  await fetchDynamicCss();
  await scrapeAssets();
  await rewriteTextFiles();

  const files = await walk(OUT_DIR);
  const pages = files.filter(file => file.endsWith('index.html')).length;
  const assets = files.length - pages;

  console.log(`\nDone. Wrote ${pages} HTML pages and ${assets} asset/support files to ${OUT_DIR}.`);
  if (failed.length) {
    console.log('\nSome URLs could not be mirrored:');
    for (const item of failed.slice(0, 50)) {
      console.log(`- ${item}`);
    }
    if (failed.length > 50) {
      console.log(`- ...and ${failed.length - 50} more`);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
