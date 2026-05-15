import {mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {dirname, extname, join, relative, resolve} from 'node:path';
import {promisify} from 'node:util';

const ORIGIN = 'https://gethapply.com';
const OUT_DIR = resolve('site');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 gethapply-local-mirror/1.0';
const MAX_ASSETS = 1500;
const FETCH_DELAY_MS = 120;
const execFileAsync = promisify(execFile);

const pageUrls = new Set();
const assetUrls = new Set();
const written = new Map();
const failed = [];
let assetCount = 0;

const staticExtensions = new Set([
  '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.md',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.webm', '.mov',
  '.pdf', '.atom', '.oembed'
]);

const assetHostHints = [
  'cdn.shopify.com',
  'shopifycdn.com',
  'gethapply.com',
  'judgeme.imgix.net',
  'placehold.co',
  's3.amazonaws.com',
  'cdn.506.io',
  'cdn.judge.me',
  'cdn1.judge.me',
  'cdn2.judge.me',
  'cdnwidget.judge.me',
  'js.hcaptcha.com',
  'connect.facebook.net',
  'analytics.tiktok.com',
  'bat.bing.com',
  'edge.marker.io'
];

const blockedPathPrefixes = [
  '/a/downloads/-/',
  '/admin',
  '/cart',
  '/carts',
  '/checkout',
  '/checkouts/',
  '/orders',
  '/account',
  '/policies/',
  '/search',
  '/sf_private_access_tokens',
  '/services/login_with_shop',
  '/apple-app-site-association',
  '/.well-known/ucp',
  '/.well-known/shopify/monorail',
  '/recommendations/products'
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

  const query = url.search.toLowerCase();
  return query.includes('sort_by') ||
    query.includes('oseid=') ||
    query.includes('preview_theme_id') ||
    query.includes('preview_script_id');
}

function isStaticUrl(url) {
  const ext = extname(url.pathname).toLowerCase();
  return staticExtensions.has(ext) ||
    url.hostname.includes('cdn.shopify.com') ||
    url.hostname.includes('shopifycdn.com') ||
    url.pathname.startsWith('/cdn/');
}

function isLikelyAssetHost(url) {
  return assetHostHints.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

function shouldDiscoverNestedAssets(url) {
  return url.origin === ORIGIN ||
    url.hostname === 'cdn.shopify.com' ||
    url.hostname.endsWith('.shopifycdn.com') ||
    url.hostname === 'cdn.shopify.com';
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
  if (contentType.includes('font/woff2')) return '.woff2';
  if (contentType.includes('font/woff')) return '.woff';
  return '';
}

function assetPath(url, contentType = '') {
  const parts = url.pathname.split('/').filter(Boolean).map(safeSegment);
  let filename = parts.pop() || 'index';
  const ext = extname(filename) || inferExtension(contentType);
  if (ext && !filename.endsWith(ext)) {
    filename += ext;
  }
  if (url.search) {
    const query = safeSegment(url.search.slice(1));
    const base = ext ? filename.slice(0, -ext.length) : filename;
    filename = `${base}__${query}${ext}`;
  }
  return join(OUT_DIR, 'assets', safeSegment(url.hostname), ...parts, filename);
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

    for (const match of source.matchAll(/\s(?:src|poster|data-src|data-poster)=["']([^"']+)["']/gi)) {
      classifyAndAdd(match[1], base, 'src');
    }

    for (const match of source.matchAll(/\shref=["']([^"']+)["']/gi)) {
      const raw = match[1];
      const hint = /\.(css|js|mjs|json|xml|txt|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf)(\?|$)/i.test(raw) ? 'stylesheet' : '';
      classifyAndAdd(raw, base, hint);
    }

    for (const match of source.matchAll(/\s(?:srcset|imagesrcset)=["']([^"']+)["']/gi)) {
      for (const part of match[1].split(',')) {
        classifyAndAdd(part.trim().split(/\s+/)[0], base, 'srcset');
      }
    }

    for (const match of source.matchAll(/url\(([^)]+)\)/gi)) {
      classifyAndAdd(match[1], base, 'url');
    }

    for (const match of source.matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)) {
      classifyAndAdd(match[0], base, isStaticUrl(normalizeUrl(match[0], base)) ? 'url' : '');
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
  const root = await fetchText(ORIGIN + '/sitemap.xml');
  const sitemapUrls = [...root.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1].replace(/&amp;/g, '&'));

  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchText(sitemapUrl);
    for (const match of xml.matchAll(/<loc>(.*?)<\/loc>/g)) {
      const loc = match[1].replace(/&amp;/g, '&');
      const url = normalizeUrl(loc);
      if (!url) continue;
      if (looksLikePage(url)) {
        addPage(url);
      } else if (isStaticUrl(url)) {
        addAsset(url);
      }
    }
    collectReferences(xml, sitemapUrl);
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

function localPathFor(raw, fromFile) {
  const url = normalizeUrl(raw, ORIGIN);
  if (!url || isBlocked(url)) {
    return raw;
  }

  let target = written.get(url.href);
  if (!target && looksLikePage(url)) {
    target = pagePath(url);
  }
  if (!target && isStaticUrl(url)) {
    target = assetPath(url);
  }
  if (!target) {
    return raw;
  }

  let rel = relative(dirname(fromFile), target).replace(/\\/g, '/');
  if (!rel.startsWith('.')) {
    rel = `./${rel}`;
  }
  return rel;
}

function replaceUrlLike(value, fromFile) {
  if (!isUrlish(value)) {
    return value;
  }
  const rewritten = localPathFor(value, fromFile);
  return rewritten;
}

function isUrlish(value) {
  const trimmed = value.trim();
  return /^(https?:)?\/\//i.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    /\.(css|js|mjs|json|xml|txt|md|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mov|pdf|atom|oembed)(\?|#|$)/i.test(trimmed);
}

function rewriteContent(text, fromFile) {
  let out = text;

  out = out.replace(/((?:href|src|poster|action|content|data-src|data-poster)=["'])([^"']+)(["'])/gi, (full, prefix, value, suffix) => {
    return `${prefix}${replaceUrlLike(value, fromFile)}${suffix}`;
  });

  out = out.replace(/((?:srcset|imagesrcset)=["'])([^"']+)(["'])/gi, (full, prefix, value, suffix) => {
    const rewritten = value.split(',').map(part => {
      const trimmed = part.trim();
      const pieces = trimmed.split(/\s+/);
      pieces[0] = replaceUrlLike(pieces[0], fromFile);
      return pieces.join(' ');
    }).join(', ');
    return `${prefix}${rewritten}${suffix}`;
  });

  out = out.replace(/url\(([^)]+)\)/gi, (full, value) => {
    const quote = value.trim().startsWith('"') ? '"' : value.trim().startsWith("'") ? "'" : '';
    const clean = value.trim().replace(/^['"]|['"]$/g, '');
    const rewritten = replaceUrlLike(clean, fromFile);
    return `url(${quote}${rewritten}${quote})`;
  });

  for (const href of written.keys()) {
    const rel = localPathFor(href, fromFile);
    out = out.split(href).join(rel);
    out = out.split(href.replace(/\//g, '\\/')).join(rel.replace(/\//g, '\\/'));
    if (href.startsWith('https://')) {
      const protocolRelative = href.replace(/^https:/, '');
      out = out.split(protocolRelative).join(rel);
    }
  }

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

async function rewriteTextFiles() {
  const files = await walk(OUT_DIR);
  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (!['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.md', '.svg'].includes(extension)) {
      continue;
    }
    const before = await readFile(file, 'utf8');
    const after = rewriteContent(before, file);
    if (after !== before) {
      await writeFile(file, after);
    }
  }
}

async function fetchThemeLazyChunks() {
  const chunkDir = join(OUT_DIR, 'assets', 'gethapply.com', 'cdn', 'shop', 't', '3', 'assets');
  let files = [];
  try {
    files = await readdir(chunkDir);
  } catch {
    return;
  }

  const appFile = files.find(file => /^app__v_.*\.js$/.test(file));
  if (!appFile) {
    return;
  }

  const appSource = await readFile(join(chunkDir, appFile), 'utf8');
  const chunkIds = [...new Set(
    [...appSource.matchAll(/i\.e\((\d+)\)/g)]
      .map(match => Number(match[1]))
      .filter(id => id !== 96)
  )].sort((a, b) => a - b);

  for (const id of chunkIds) {
    const target = join(chunkDir, `${id}.js`);
    try {
      await stat(target);
      continue;
    } catch {}

    try {
      const url = new URL(`${ORIGIN}/cdn/shop/t/3/assets/assets/${id}.js`);
      const {buffer} = await fetchBuffer(url);
      await mkdir(dirname(target), {recursive: true});
      await writeFile(target, buffer);
      written.set(url.href, target);
      console.log(`chunk ${url.href}`);
    } catch (error) {
      failed.push(`${ORIGIN}/cdn/shop/t/3/assets/assets/${id}.js: ${error.message}`);
    }
  }
}

async function injectLocalLazyChunks() {
  const chunkDir = join(OUT_DIR, 'assets', 'gethapply.com', 'cdn', 'shop', 't', '3', 'assets');
  let chunks = [];
  try {
    chunks = (await readdir(chunkDir))
      .filter(file => /^[0-9]+\.js$/.test(file))
      .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]));
  } catch {
    return;
  }

  if (!chunks.length) {
    return;
  }

  const block = [
    '<!-- Local mirror: eagerly register Shopify lazy interaction chunks. -->',
    ...chunks.map(file => `<script defer src="/assets/gethapply.com/cdn/shop/t/3/assets/${file}"></script>`),
    '<!-- /Local mirror lazy chunks -->'
  ].join('\n');

  const pages = (await walk(OUT_DIR)).filter(file => file.endsWith('index.html'));
  for (const page of pages) {
    let html = await readFile(page, 'utf8');
    html = html.replace(/\n?<!-- Local mirror: eagerly register Shopify lazy interaction chunks\. -->[\s\S]*?<!-- \/Local mirror lazy chunks -->\n?/g, '\n');

    const appScriptPattern = /<script src="[^"]*app__v_130711885900607905571776261783_v_1\.0\.6\.js" defer><\/script>/;
    if (appScriptPattern.test(html)) {
      html = html.replace(appScriptPattern, match => `${match}\n${block}`);
    } else {
      html = html.replace('</head>', `${block}\n</head>`);
    }

    await writeFile(page, html);
  }
}

async function writeLocalFixes() {
  await writeFile(join(OUT_DIR, 'local-fixes.css'), `@font-face {
  font-family: "RethinkSans-Regular";
  font-style: normal;
  font-display: swap;
  src:
    url("/assets/gethapply.com/cdn/shop/t/3/assets/RethinkSans-Regular.woff2") format("woff2"),
    url("/assets/gethapply.com/cdn/shop/t/3/assets/RethinkSans-Regular.woff") format("woff");
}

@font-face {
  font-family: "RethinkSans-Medium";
  font-style: normal;
  font-display: swap;
  src:
    url("/assets/gethapply.com/cdn/shop/t/3/assets/RethinkSans-Medium.woff2") format("woff2"),
    url("/assets/gethapply.com/cdn/shop/t/3/assets/RethinkSans-Medium.woff") format("woff");
}

@font-face {
  font-family: "RethinkSans-SemiBold";
  font-style: normal;
  font-display: swap;
  src:
    url("/assets/gethapply.com/cdn/shop/t/3/assets/RethinkSans-SemiBold.woff2") format("woff2"),
    url("/assets/gethapply.com/cdn/shop/t/3/assets/RethinkSans-SemiBold.woff") format("woff");
}

@font-face {
  font-family: "RethinkSans-Bold";
  font-style: normal;
  font-display: swap;
  src:
    url("/assets/gethapply.com/cdn/shop/t/3/assets/RethinkSans-Bold.woff2") format("woff2"),
    url("/assets/gethapply.com/cdn/shop/t/3/assets/RethinkSans-Bold.woff") format("woff");
}
`);

  await writeFile(join(OUT_DIR, 'local-fixes.js'), `(function () {
  const storageKey = "happly-age-verified";

  function textOf(button) {
    return (button && button.textContent ? button.textContent : "").trim().toLowerCase();
  }

  function verify() {
    try {
      window.localStorage.setItem(storageKey, "yes");
      window.localStorage.setItem("age_verified", "1");
    } catch (_) {}

    document.querySelectorAll(".b-agegate").forEach((gate) => {
      gate.classList.add("verified");
    });

    document.querySelectorAll(".b-popup.active").forEach((popup) => {
      popup.classList.remove("active", "age-verify");
    });

    document.documentElement.classList.remove("hidden");
    document.body.classList.remove("hidden");
  }

  function deny(button) {
    const gate = button.closest(".b-agegate");
    const wrapper = gate && gate.querySelector(".b-agegate__wrapper");
    if (wrapper) {
      wrapper.classList.add("denied");
    }
  }

  function applySavedState() {
    try {
      if (
        window.localStorage.getItem(storageKey) === "yes" ||
        window.localStorage.getItem("age_verified")
      ) {
        verify();
      }
    } catch (_) {}
  }

  document.addEventListener(
    "click",
    function (event) {
      const button = event.target.closest("button");
      if (!button) {
        return;
      }

      if (button.matches('[data-age="yes"]')) {
        event.preventDefault();
        event.stopPropagation();
        verify();
        return;
      }

      if (button.matches('[data-age="n"]')) {
        event.preventDefault();
        event.stopPropagation();
        deny(button);
        return;
      }

      const ageGateActions = button.closest(".b-agegate__actions");
      if (!ageGateActions) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (textOf(button) === "yes") {
        verify();
      } else {
        deny(button);
      }
    },
    true
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applySavedState);
  } else {
    applySavedState();
  }
})();
`);
}

async function injectLocalFixes() {
  const pages = (await walk(OUT_DIR)).filter(file => file.endsWith('index.html'));
  for (const page of pages) {
    let html = await readFile(page, 'utf8');
    html = html
      .replace(/\n?<link rel="stylesheet" href="\/local-fixes\.css">\n?/g, '\n')
      .replace(/\n?<script src="\/local-fixes\.js"><\/script>\n?/g, '\n');
    html = html.replace('</head>', '<link rel="stylesheet" href="/local-fixes.css">\n</head>');
    html = html.replace('</body>', '<script src="/local-fixes.js"></script>\n</body>');
    await writeFile(page, html);
  }
}

async function main() {
  await rm(OUT_DIR, {recursive: true, force: true});
  await mkdir(OUT_DIR, {recursive: true});

  await seedFromSitemaps();
  await scrapePages();
  await scrapeAssets();
  await scrapeAssets();
  await fetchThemeLazyChunks();
  await rewriteTextFiles();
  await writeLocalFixes();
  await injectLocalFixes();
  await injectLocalLazyChunks();

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
