#!/usr/bin/env node
import {copyFile, mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {dirname, extname, join, relative, resolve, sep} from 'node:path';
import {promisify} from 'node:util';

const START_URL = 'https://www.getty.edu/tracingart/';
const ORIGIN = 'https://www.getty.edu';
const OUT_DIR = resolve('site');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 tracingart-local-mirror/1.0';
const FETCH_DELAY_MS = 60;
const MAX_FETCHES = 5000;
const execFileAsync = promisify(execFile);

const queued = [];
const seen = new Set();
const written = new Map();
const failed = [];

const textExtensions = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg', '.webmanifest', '.map'
]);

const staticExtensions = new Set([
  ...textExtensions,
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp4', '.webm', '.mov', '.m4v',
  '.glb', '.gltf', '.bin', '.wasm', '.basis', '.ktx', '.ktx2',
  '.csv', '.pdf'
]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanRawUrl(raw) {
  if (!raw) return '';
  return String(raw)
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/\\\//g, '/')
    .replace(/^url\(/i, '')
    .replace(/\)$/i, '')
    .replace(/^['"]|['"]$/g, '');
}

function normalizeUrl(raw, base = START_URL) {
  const cleaned = cleanRawUrl(raw);
  if (
    !cleaned ||
    cleaned.startsWith('#') ||
    cleaned.startsWith('mailto:') ||
    cleaned.startsWith('tel:') ||
    cleaned.startsWith('javascript:') ||
    cleaned.startsWith('data:') ||
    cleaned.startsWith('blob:') ||
    cleaned.startsWith('about:')
  ) {
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

function isGettyHost(url) {
  return url.hostname === 'www.getty.edu' || url.hostname === 'getty.edu';
}

function isTracingArtPath(url) {
  return isGettyHost(url) && (url.pathname === '/tracingart' || url.pathname.startsWith('/tracingart/'));
}

function hasStaticExtension(url) {
  return staticExtensions.has(extname(url.pathname).toLowerCase());
}

function shouldFetch(url, hint = '') {
  if (url.href === START_URL) return true;
  if (isTracingArtPath(url) && hasStaticExtension(url)) return true;
  if (isGettyHost(url) && url.pathname.startsWith('/tracingart/') && hasStaticExtension(url)) return true;
  if (url.hostname === 'static.getty.edu' && hasStaticExtension(url)) return true;
  return false;
}

function enqueue(raw, base = START_URL, hint = '') {
  const url = normalizeUrl(raw, base);
  if (!url || !shouldFetch(url, hint)) return;
  const key = url.href;
  if (seen.has(key) || queued.length + seen.size >= MAX_FETCHES) return;
  seen.add(key);
  queued.push(url);
}

function inferExtension(contentType) {
  const type = contentType.toLowerCase();
  if (type.includes('text/html')) return '.html';
  if (type.includes('text/css')) return '.css';
  if (type.includes('javascript')) return '.js';
  if (type.includes('json')) return '.json';
  if (type.includes('manifest')) return '.webmanifest';
  if (type.includes('xml')) return '.xml';
  if (type.includes('image/svg')) return '.svg';
  if (type.includes('image/png')) return '.png';
  if (type.includes('image/jpeg')) return '.jpg';
  if (type.includes('image/webp')) return '.webp';
  if (type.includes('image/gif')) return '.gif';
  if (type.includes('font/woff2')) return '.woff2';
  if (type.includes('font/woff')) return '.woff';
  if (type.includes('font/otf')) return '.otf';
  if (type.includes('video/mp4')) return '.mp4';
  if (type.includes('video/webm')) return '.webm';
  return '';
}

function safeSegment(value) {
  return decodeURIComponent(value)
    .replace(/%/g, '_')
    .replace(/[^a-zA-Z0-9._ -]+/g, '_')
    .replace(/\s+/g, '-')
    .replace(/^_+|_+$/g, '') || 'index';
}

function localPathForUrl(url, contentType = '') {
  if (isTracingArtPath(url)) {
    let pathname = url.pathname;
    if (pathname === '/tracingart') pathname = '/tracingart/';
    if (pathname.endsWith('/')) pathname += 'index.html';
    if (!extname(pathname)) {
      const ext = inferExtension(contentType);
      if (ext) pathname += ext;
    }
    return join(OUT_DIR, ...pathname.split('/').filter(Boolean));
  }

  const parts = url.pathname.split('/').filter(Boolean).map(safeSegment);
  let filename = parts.pop() || 'index';
  const ext = extname(filename) || inferExtension(contentType);
  if (ext && !filename.endsWith(ext)) filename += ext;
  if (url.search) {
    const query = safeSegment(url.search.slice(1));
    const base = ext ? filename.slice(0, -ext.length) : filename;
    filename = `${base}__${query}${ext}`;
  }
  return join(OUT_DIR, 'assets', safeSegment(url.hostname), ...parts, filename);
}

async function fetchBuffer(url) {
  await sleep(FETCH_DELAY_MS);
  const href = url.href;
  const meta = await execFileAsync('curl', [
    '-L', '-sS', '--fail', '-A', USER_AGENT, '-o', '/dev/null', '-w', '%{content_type}', href
  ], {maxBuffer: 1024 * 1024});
  const body = await execFileAsync('curl', ['-L', '-sS', '--fail', '-A', USER_AGENT, href], {
    encoding: 'buffer',
    maxBuffer: 160 * 1024 * 1024
  });
  return {buffer: body.stdout, contentType: String(meta.stdout || '')};
}

function collectReferences(text, base) {
  const sources = [text, text.replace(/\\\//g, '/')];
  for (const source of sources) {
    for (const match of source.matchAll(/\s(?:href|src|poster|data-src|data-poster|action)=["']([^"']+)["']/gi)) {
      const attr = match[0].match(/\s([a-z-]+)=/i)?.[1]?.toLowerCase() || '';
      enqueue(match[1], base, attr === 'href' ? 'stylesheet' : 'src');
    }

    for (const match of source.matchAll(/\s(?:srcset|imagesrcset)=["']([^"']+)["']/gi)) {
      for (const part of match[1].split(',')) {
        enqueue(part.trim().split(/\s+/)[0], base, 'srcset');
      }
    }

    for (const match of source.matchAll(/url\(([^)]+)\)/gi)) {
      enqueue(match[1], base, 'url');
    }

    for (const match of source.matchAll(/(?:import\(|from\s*)["']([^"']+)["']/gi)) {
      enqueue(match[1], base, 'import');
    }

    for (const match of source.matchAll(/["']((?:\.{0,2}\/|\/tracingart\/)[^"']+\.(?:css|js|mjs|json|webmanifest|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|mp4|webm|glb|gltf|bin|wasm|ktx2?)(?:\?[^"']*)?)["']/gi)) {
      enqueue(match[1], base, 'url');
    }

    for (const match of source.matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)) {
      enqueue(match[0].replace(/[),.;]+$/g, ''), base, 'url');
    }
  }
}

function isTextAsset(pathname, contentType) {
  const ext = extname(pathname).toLowerCase();
  return textExtensions.has(ext) || /text\/|javascript|json|xml|manifest/.test(contentType.toLowerCase());
}

async function fetchAll() {
  enqueue(START_URL, START_URL, 'page');

  for (let index = 0; index < queued.length && index < MAX_FETCHES; index++) {
    const url = queued[index];
    try {
      const {buffer, contentType} = await fetchBuffer(url);
      const target = localPathForUrl(url, contentType);
      await mkdir(dirname(target), {recursive: true});
      await writeFile(target, buffer);
      written.set(url.href, target);
      if (isTextAsset(target, contentType)) {
        collectReferences(buffer.toString('utf8'), url.href);
      }
      console.log(`asset ${url.href}`);
    } catch (error) {
      failed.push(`${url.href}: ${error.message}`);
    }
  }
}

async function walk(dir) {
  const entries = await readdir(dir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function publicPathForTarget(target) {
  const rel = relative(OUT_DIR, target).split(sep).join('/');
  return `/${rel}`;
}

function rewriteContent(text, file) {
  let out = text;
  for (const [href, target] of written.entries()) {
    let local = publicPathForTarget(target);
    if (href === START_URL) {
      local = '/tracingart/';
    }
    const escapedHref = href.replace(/\//g, '\\/');
    out = out.split(href).join(local);
    out = out.split(escapedHref).join(local.replace(/\//g, '\\/'));
    if (href !== START_URL && href.startsWith('https://www.getty.edu/tracingart/')) {
      const pathOnly = href.replace('https://www.getty.edu', '');
      if (pathOnly !== '/tracingart/') out = out.split(pathOnly).join(local);
    }
    if (href !== START_URL && href.startsWith('https://getty.edu/tracingart/')) {
      const pathOnly = href.replace('https://getty.edu', '');
      if (pathOnly !== '/tracingart/') out = out.split(pathOnly).join(local);
    }
  }

  out = out
    .replace(/https:\/\/www\.getty\.edu\/tracingart\//g, '/tracingart/')
    .replace(/https:\/\/getty\.edu\/tracingart\//g, '/tracingart/')
    .replace(/https:\\\/\\\/www\.getty\.edu\\\/tracingart\\\//g, '\\/tracingart\\/')
    .replace(/https:\\\/\\\/getty\.edu\\\/tracingart\\\//g, '\\/tracingart\\/')
    .replace(/https:\/\/www\.getty\.edu\/tracingart/g, '/tracingart/')
    .replace(/https:\/\/getty\.edu\/tracingart/g, '/tracingart/')
    .replace(/plausible:\{enabled:true,/g, 'plausible:{enabled:false,')
    .replace(/apiHost:"https:\/\/static\.getty\.edu"/g, 'apiHost:""');

  if (file.endsWith('.html')) {
    out = out.replace(/(<head\b[^>]*>)/i, (match) => {
      if (out.includes('src="/net-shim.js"')) return match;
      return `${match}\n<script src="/net-shim.js"></script>`;
    });
  }

  return out;
}

async function rewriteTextFiles() {
  const files = await walk(OUT_DIR);
  for (const file of files) {
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    const before = await readFile(file, 'utf8');
    const after = rewriteContent(before, file);
    if (after !== before) {
      await writeFile(file, after);
    }
  }
}

async function writeRootRedirect() {
  await writeFile(join(OUT_DIR, 'index.html'), '<!doctype html><meta charset="utf-8"><script src="/net-shim.js"></script><meta http-equiv="refresh" content="0; url=/tracingart/"><title>Tracing Art</title><a href="/tracingart/">Tracing Art</a>\n');
}

async function fetchNuxtBuildManifest() {
  const indexPath = join(OUT_DIR, 'tracingart', 'index.html');
  let html = '';
  try {
    html = await readFile(indexPath, 'utf8');
  } catch {
    return;
  }

  const buildId = html.match(/buildId:"([^"]+)"/)?.[1];
  if (!buildId) {
    return;
  }

  const url = new URL(`/tracingart/_nuxt/builds/meta/${buildId}.json`, ORIGIN);
  try {
    const {buffer, contentType} = await fetchBuffer(url);
    const target = localPathForUrl(url, contentType);
    await mkdir(dirname(target), {recursive: true});
    await writeFile(target, buffer);
    written.set(url.href, target);
    console.log(`asset ${url.href}`);
  } catch (error) {
    failed.push(`${url.href}: ${error.message}`);
  }
}

async function fetchIfAvailable(pathname) {
  const url = new URL(pathname, ORIGIN);
  const target = localPathForUrl(url, '');
  try {
    await stat(target);
    return true;
  } catch {
    // Continue and try to mirror it.
  }

  try {
    await sleep(FETCH_DELAY_MS);
    const body = await execFileAsync('curl', ['-L', '-sS', '--fail', '-A', USER_AGENT, url.href], {
      encoding: 'buffer',
      maxBuffer: 160 * 1024 * 1024
    });
    await mkdir(dirname(target), {recursive: true});
    await writeFile(target, body.stdout);
    written.set(url.href, target);
    console.log(`asset ${url.href}`);
    return true;
  } catch {
    return false;
  }
}

async function runLimited(items, limit, callback) {
  let index = 0;
  const workers = Array.from({length: Math.min(limit, items.length)}, async () => {
    while (index < items.length) {
      const item = items[index++];
      await callback(item);
    }
  });
  await Promise.all(workers);
}

async function fetchNuxtLazyAssets() {
  const nuxtDir = join(OUT_DIR, 'tracingart', '_nuxt');
  let files = [];
  try {
    files = (await walk(nuxtDir)).filter(file => textExtensions.has(extname(file).toLowerCase()));
  } catch {
    return;
  }

  const text = (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n');
  const imageNames = new Set();
  for (const source of [text, text.replace(/\\\//g, '/')]) {
    for (const match of source.matchAll(/img:"([^"]+)"/g)) {
      imageNames.add(match[1]);
    }
  }

  const folders = ['intro', 'still-life', 'artist-to-artist', 'world-of-gpi'];
  const sizes = ['lg', 'sm'];
  let lazyHits = 0;
  const candidates = [];
  for (const name of imageNames) {
    for (const normalizedName of new Set([name, name.normalize('NFC'), name.normalize('NFD')])) {
      for (const folder of folders) {
        for (const size of sizes) {
          candidates.push(`/tracingart/images/getty/${folder}/${encodeURIComponent(`${normalizedName}@${size}.webp`)}`);
        }
      }
    }
  }

  await runLimited(candidates, 16, async pathname => {
    if (await fetchIfAvailable(pathname)) {
      lazyHits++;
    }
  });

  const metadataPath = '/tracingart/images/getty-spritesheets/generated/data-viz/metadata.json';
  if (await fetchIfAvailable(metadataPath)) {
    try {
      const metadata = JSON.parse(await readFile(join(OUT_DIR, ...metadataPath.split('/').filter(Boolean)), 'utf8'));
      for (const sheet of metadata.spritesheets || []) {
        if (!sheet.filename) continue;
        const base = sheet.filename.replace(/\.[^.]+$/, '');
        await runLimited([sheet.filename, `${base}@lg.webp`, `${base}@sm.webp`], 3, variant =>
          fetchIfAvailable(`/tracingart/images/getty-spritesheets/generated/data-viz/${variant}`)
        );
      }
    } catch (error) {
      failed.push(`${metadataPath}: ${error.message}`);
    }
  }

  console.log(`lazy-assets ${lazyHits} generated Getty images mirrored`);
}

async function writeGraphikFallbackFonts() {
  const targetDir = join(OUT_DIR, 'tracingart', 'fonts', 'graphik');
  await mkdir(targetDir, {recursive: true});
  const fallbacks = [
    ['/Library/Fonts/HelveticaNeueLTPro-Roman.ttf', 'Graphik-Regular-Web.ttf'],
    ['/Library/Fonts/HelveticaNeueLTPro-Md.ttf', 'Graphik-Medium-Web.ttf'],
    ['/Library/Fonts/HelveticaNeueLTPro-Bd.ttf', 'Graphik-Semibold-Web.ttf']
  ];

  for (const [source, target] of fallbacks) {
    try {
      await copyFile(source, join(targetDir, target));
    } catch {
      // The original Graphik files are not publicly fetchable. If the local
      // Helvetica Neue fallback is unavailable, the browser will use its
      // normal sans-serif fallback rather than reaching the network.
    }
  }
}

async function patchGraphikFontFaces() {
  const files = (await walk(OUT_DIR)).filter(file => textExtensions.has(extname(file).toLowerCase()));
  for (const file of files) {
    const before = await readFile(file, 'utf8');
    const after = before
      .replace(/url\(\/tracingart\/fonts\/graphik\/Graphik-Regular-Web\.woff2\) format\("woff2"\)/g, 'url(/tracingart/fonts/graphik/Graphik-Regular-Web.ttf) format("truetype")')
      .replace(/url\(\/tracingart\/fonts\/graphik\/Graphik-Medium-Web\.woff2\) format\("woff2"\)/g, 'url(/tracingart/fonts/graphik/Graphik-Medium-Web.ttf) format("truetype")')
      .replace(/url\(\/tracingart\/fonts\/graphik\/Graphik-Semibold-Web\.woff2\) format\("woff2"\)/g, 'url(/tracingart/fonts/graphik/Graphik-Semibold-Web.ttf) format("truetype")');
    if (after !== before) {
      await writeFile(file, after);
    }
  }
}

async function main() {
  await mkdir(OUT_DIR, {recursive: true});
  await fetchAll();
  await rewriteTextFiles();
  await fetchNuxtBuildManifest();
  await fetchNuxtLazyAssets();
  await writeGraphikFallbackFonts();
  await patchGraphikFontFaces();
  await writeRootRedirect();

  const files = await walk(OUT_DIR);
  console.log(`\nDone. Wrote ${files.length} files to ${OUT_DIR}.`);
  if (failed.length) {
    console.log('\nSome URLs could not be mirrored:');
    for (const item of failed.slice(0, 80)) console.log(`- ${item}`);
    if (failed.length > 80) console.log(`- ...and ${failed.length - 80} more`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
