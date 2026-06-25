#!/usr/bin/env node
// scrape-blog.mjs
//
// Mirror the beehiiv newsletter archive root (https://247.beehiiv.com/) into a
// fully self-contained local page served at /blog/. The site nav's "Blog" link
// (currently the external beehiiv URL) is repointed to /blog/.
//
// Scope (per request):
//   - Only the archive ROOT (first page). No pagination, no per-post pages.
//   - Each post tile keeps its REAL beehiiv URL (absolute https) so it opens
//     the original article.
//   - Subscribe form + Subscribe/Login buttons are handled by blog-mock.js
//     (success modal); the beehiiv hydration JS is stripped entirely.
//   - All CSS / fonts / images are downloaded; zero external calls at runtime.
//
// Idempotent + rebuild-safe: writes to both site/ and legacy/ and copies assets
// into both asset trees.

import {mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname, join, resolve, extname} from 'node:path';

const execFileAsync = promisify(execFile);

const ORIGIN = 'https://247.beehiiv.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 247artists-local-mirror/1.0';
const ROOTS = ['site', 'legacy'].map(r => resolve(r)).filter(existsSync);

// Hosts whose URLs are always treated as downloadable assets.
const ASSET_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'media.beehiiv.com',
  'beehiiv-images-production.s3.amazonaws.com',
  'beehiiv-adnetwork-production.s3.amazonaws.com',
];

async function curlText(url) {
  const {stdout} = await execFileAsync('curl', ['-L', '-sS', '--fail', '-A', UA, url], {
    encoding: 'buffer',
    maxBuffer: 200 * 1024 * 1024,
  });
  return stdout.toString('utf8');
}
async function curlDownload(url, dest) {
  await mkdir(dirname(dest), {recursive: true});
  await execFileAsync('curl', ['-L', '-sS', '--fail', '-A', UA, '-o', dest, url], {
    maxBuffer: 200 * 1024 * 1024,
  });
}

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function sanitizeSeg(seg) {
  return seg.replace(/[^A-Za-z0-9._-]/g, '_');
}

function isAssetHost(host) {
  return ASSET_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

// downloadUrl -> { rel } where rel is the local path under a root (assets/...).
const assets = new Map();

// Map an absolute asset URL to a local /assets/<host>/<path> ref (records it for
// download). Returns null for non-asset URLs.
function assetLocal(rawUrl, baseUrl = ORIGIN) {
  let url;
  try {
    url = new URL(rawUrl, baseUrl);
  } catch {
    return null;
  }
  const isHostAsset = isAssetHost(url.hostname);
  const isLocalAsset =
    (url.hostname === '247.beehiiv.com' || rawUrl.startsWith('/')) &&
    url.pathname.startsWith('/assets/') &&
    /\.(css|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico)$/i.test(url.pathname);
  if (!isHostAsset && !isLocalAsset) return null;

  const segs = url.pathname.split('/').filter(Boolean).map(sanitizeSeg);
  let file = segs.pop() || 'index';
  let ext = extname(file);
  // Google Fonts css2 has no extension in the path.
  if (!ext) {
    if (url.hostname === 'fonts.googleapis.com') ext = '.css';
    file = file + ext;
  }
  // Disambiguate query-bearing URLs (e.g. fonts css2?family=...).
  if (url.search) {
    const base = ext ? file.slice(0, -ext.length) : file;
    file = base + '_' + djb2(url.search) + ext;
  }
  const rel = ['assets', sanitizeSeg(url.hostname), ...segs, file].join('/');
  assets.set(url.toString(), {rel});
  return '/' + rel;
}

// Rewrite url(...) refs inside a downloaded CSS file, recording nested assets.
function rewriteCssUrls(css, baseUrl) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, q, ref) => {
    if (/^data:/i.test(ref)) return full;
    const local = assetLocal(ref, baseUrl);
    return local ? `url(${q}${local}${q})` : full;
  });
}

// Rewrite a page/link href that is NOT an asset.
function rewritePageHref(value) {
  if (value === '/' || value === '') return '/blog/';
  if (value.startsWith('/')) {
    // Keep the subscribe form action local (intercepted by blog-mock.js).
    if (value === '/create' || value.startsWith('/create?')) return value;
    // Everything else (posts /p/..., /archive..., /about, etc.) -> original site.
    return ORIGIN + value;
  }
  return value; // absolute external (socials, beehiiv pages) -> keep
}

function rewriteRefAttr(value, baseUrl) {
  const local = assetLocal(value, baseUrl);
  if (local) return local;
  return rewritePageHref(value);
}

function rewriteSrcset(value, baseUrl) {
  return value
    .split(',')
    .map(part => {
      const pieces = part.trim().split(/\s+/);
      if (pieces[0]) pieces[0] = rewriteRefAttr(pieces[0], baseUrl);
      return pieces.join(' ');
    })
    .join(', ');
}

function stripTags(html) {
  let out = html;
  // Remove ALL scripts (inline + external): layout is pure HTML/CSS.
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<script\b[^>]*\/>/gi, '');
  // Remove modulepreload / preconnect / dns-prefetch / JS preloads.
  out = out.replace(/<link\b[^>]*rel=("|')modulepreload\1[^>]*>/gi, '');
  out = out.replace(/<link\b[^>]*rel=("|')(preconnect|dns-prefetch)\1[^>]*>/gi, '');
  out = out.replace(/<link\b[^>]*\bas=("|')script\1[^>]*>/gi, '');
  out = out.replace(/<link\b[^>]*rel=("|')preload\1[^>]*href=("|')[^"']*\/assets\/[^"']*\.js\2[^>]*>/gi, '');
  return out;
}

function rewriteHtml(html) {
  let out = stripTags(html);

  // Rewrite href / src / poster.
  out = out.replace(/\s(href|src|poster)=("|')([^"']*)\2/gi, (full, attr, q, val) => {
    if (!val || /^(#|mailto:|tel:|javascript:|data:)/i.test(val)) return full;
    return ` ${attr}=${q}${rewriteRefAttr(val, ORIGIN)}${q}`;
  });
  // Rewrite srcset / imagesrcset.
  out = out.replace(/\s(srcset|imagesrcset)=("|')([^"']*)\2/gi, (full, attr, q, val) => {
    return ` ${attr}=${q}${rewriteSrcset(val, ORIGIN)}${q}`;
  });
  // Inline style="...url(...)..." (e.g. background images).
  out = out.replace(/style=("|')([^"']*url\([^"']*)\1/gi, (full, q, val) => {
    return `style=${q}${rewriteCssUrls(val, ORIGIN)}${q}`;
  });

  // Inject net-shim first in <head>, blog-mock CSS in <head>, blog-mock JS before </body>.
  out = out.replace(/<head([^>]*)>/i, `<head$1>\n<script src="/net-shim.js"></script>\n<link rel="stylesheet" href="/blog-mock.css"/>`);
  out = out.replace(/<\/body>/i, `<script src="/blog-mock.js" defer></script>\n</body>`);
  return out;
}

async function downloadAssets() {
  // Pass 1 already populated `assets` from the HTML. Download them; for CSS,
  // parse nested url() refs (fonts/images), rewrite, and re-save locally.
  const queue = [...assets.keys()];
  const done = new Set();
  let count = 0;
  while (queue.length) {
    const url = queue.shift();
    if (done.has(url)) continue;
    done.add(url);
    const meta = assets.get(url);
    if (!meta) continue;
    const isCss = meta.rel.endsWith('.css');
    try {
      if (isCss) {
        let css = await curlText(url);
        const before = assets.size;
        css = rewriteCssUrls(css, url);
        // Newly discovered nested assets -> enqueue.
        for (const k of assets.keys()) if (!done.has(k)) queue.push(k);
        for (const dest of ROOTS.map(r => join(r, meta.rel))) {
          await mkdir(dirname(dest), {recursive: true});
          await writeFile(dest, css);
        }
        count++;
        if (assets.size > before) console.log(`css   ${url}  (+${assets.size - before} nested)`);
        else console.log(`css   ${url}`);
      } else {
        const missing = ROOTS.map(r => join(r, meta.rel)).filter(d => !existsSync(d));
        if (missing.length) {
          await curlDownload(url, missing[0]);
          for (const dest of missing.slice(1)) {
            await mkdir(dirname(dest), {recursive: true});
            await execFileAsync('cp', [missing[0], dest]);
          }
        }
        count++;
      }
    } catch (e) {
      console.log(`FAIL  ${url}: ${e.message}`);
    }
  }
  return count;
}

async function rewriteBlogNav() {
  // Repoint the site nav "Blog" link (external beehiiv root) to local /blog/.
  const {readdirSync, statSync} = await import('node:fs');
  const {readFile} = await import('node:fs/promises');
  let changed = 0;
  function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) out.push(...walk(p));
      else if (name.endsWith('.html')) out.push(p);
    }
    return out;
  }
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      // Don't touch the blog page itself (its logo/home already -> /blog/).
      if (file.includes(`${root}/blog/`) || file.endsWith(`/blog/index.html`)) continue;
      const html = await readFile(file, 'utf8');
      const next = html.split('href="https://247.beehiiv.com/"').join('href="/blog/"');
      if (next !== html) {
        await writeFile(file, next);
        changed++;
      }
    }
  }
  return changed;
}

async function run() {
  if (!ROOTS.length) throw new Error('no site/ or legacy/ root found');
  console.log(`Scraping ${ORIGIN} -> /blog/ (roots: ${ROOTS.map(r => r.split('/').pop()).join(', ')})`);

  const html = await curlText(ORIGIN + '/');
  const rewritten = rewriteHtml(html); // also populates `assets`
  const assetCount = await downloadAssets();

  for (const root of ROOTS) {
    const dest = join(root, 'blog', 'index.html');
    await mkdir(dirname(dest), {recursive: true});
    await writeFile(dest, rewritten);
    // Ensure the runtime mock files are present in this root.
    for (const f of ['blog-mock.js', 'blog-mock.css']) {
      const src = resolve('scripts', 'runtime', f);
      await execFileAsync('cp', [src, join(root, f)]);
    }
  }
  const navChanged = await rewriteBlogNav();

  console.log(
    `\nDone. blog page written to ${ROOTS.length} root(s); assets=${assetCount}; nav links repointed in ${navChanged} page(s).`
  );
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
