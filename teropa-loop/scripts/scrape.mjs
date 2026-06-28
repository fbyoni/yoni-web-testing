// Self-contained mirror of https://teropa.info/loop/ ("How Generative Music Works").
//
// The page is a single impress.js presentation that loads everything with
// document-relative paths (bundle.js, main.<hash>.css, static_assets/...).
// Webpack's public path is "" so all hashed media files (mp3/png/svg/...) live
// right next to bundle.js under /loop/. The Tone.js piano additionally streams
// the Salamander Grand Piano sample library from /loop/static_assets/Salamander/.
//
// Because every reference is already relative to /loop/, we mirror the exact
// same directory layout under site/loop/ and need NO URL rewriting: the local
// copy resolves identically when served at http://localhost:5173/loop/.

import {mkdir, readFile, writeFile, stat, rename, unlink} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

const ORIGIN = 'https://teropa.info';
const BASE_PATH = '/loop/';
const SITE_DIR = resolve('site');                 // server root
const OUT_DIR = join(SITE_DIR, 'loop');           // the /loop/ tree
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 teropa-loop-local-mirror/1.0';
const CONCURRENCY = 8;
const RETRIES = 3;

let downloaded = 0;
let skipped = 0;
const failed = [];

function url(name) {
  return ORIGIN + BASE_PATH + name;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

// Node's raw sockets are blocked in this sandbox, but curl is permitted, so all
// network I/O goes through curl. Body is streamed to `destTmp`; status and
// content-type come back on stdout via -w.
async function curlTo(href, destTmp) {
  let lastErr;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const {stdout} = await execFileAsync('curl', [
        '-sS', '-L', '-A', USER_AGENT,
        '-o', destTmp,
        '-w', '%{http_code} %{content_type}',
        href
      ], {maxBuffer: 8 * 1024 * 1024});
      const [code, ...ct] = String(stdout).trim().split(' ');
      const status = Number(code);
      return {ok: status >= 200 && status < 400, status, contentType: ct.join(' ')};
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Fetch into memory (small text resources / the page itself).
async function fetchBuffer(href) {
  const tmp = join(SITE_DIR, `.fetch-${Math.abs(hashStr(href))}.tmp`);
  await mkdir(SITE_DIR, {recursive: true});
  const {ok, status, contentType} = await curlTo(href, tmp);
  const buffer = await readFile(tmp);
  await unlink(tmp).catch(() => {});
  return {ok, status, contentType, buffer};
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// teropa.info answers missing files with a 200 + an HTML soft-404 page. Treat
// any HTML payload for a non-HTML asset as "does not exist".
function isRealAsset(contentType, expectHtml = false) {
  if (expectHtml) return true;
  return !/text\/html/i.test(contentType);
}

async function save(relPath, buffer) {
  const target = join(OUT_DIR, relPath);
  await mkdir(dirname(target), {recursive: true});
  await writeFile(target, buffer);
}

// Download `relPath` (relative to /loop/) unless it already exists on disk.
async function grab(relPath, {expectHtml = false, optional = false} = {}) {
  const target = join(OUT_DIR, relPath);
  if (await exists(target)) { skipped++; return true; }
  const tmp = `${target}.part`;
  try {
    await mkdir(dirname(target), {recursive: true});
    const {ok, status, contentType} = await curlTo(url(relPath), tmp);
    let size = 0;
    try { size = (await stat(tmp)).size; } catch {}
    if (!ok || !isRealAsset(contentType, expectHtml) || size === 0) {
      await unlink(tmp).catch(() => {});
      if (!optional) failed.push(`${relPath}: status ${status} type ${contentType} len ${size}`);
      return false;
    }
    await rename(tmp, target);
    downloaded++;
    if (downloaded % 50 === 0) console.log(`  …${downloaded} files`);
    return true;
  } catch (err) {
    await unlink(tmp).catch(() => {});
    if (!optional) failed.push(`${relPath}: ${err.message}`);
    return false;
  }
}

// Simple bounded-concurrency runner.
async function pool(items, worker, concurrency = CONCURRENCY) {
  const queue = [...items];
  const runners = Array.from({length: concurrency}, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function uniq(arr) { return [...new Set(arr)]; }

// Every 32-hex-char webpack asset name referenced in a text file.
function hashedAssets(text) {
  return uniq([...text.matchAll(/[0-9a-f]{32}\.(?:mp3|ogg|wav|png|jpe?g|gif|svg|webp|woff2?|ttf|otf|eot)/g)].map(m => m[0]));
}

// ---- Salamander sample manifest (from the tone-piano library in bundle.js) ----
// Notes URL:   midiToNote(m).replace('#','s') + 'v' + velocity + '.mp3'
// Releases:    'rel' + (m-20) + '.mp3'
// Harmonics:   'harmL' + midiToNote(m).replace('#','s') + '.mp3'  (low notes only)
// Pedal:       pedalU1.mp3 / pedalD1.mp3
// Sampled notes are every 3 semitones across the keyboard; each note ships 16
// velocity layers. We probe the full conventional namespace and keep whatever
// the server actually serves, so any runtime request resolves locally.
const NOTE_NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
function midiToNote(m) {
  return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
}

function salamanderCandidates() {
  const files = ['pedalU1.mp3', 'pedalD1.mp3'];
  for (let m = 21; m <= 108; m += 3) {           // sampled notes (every minor third)
    const note = midiToNote(m);
    for (let v = 1; v <= 16; v++) files.push(`${note}v${v}.mp3`);
    files.push(`harmL${note}.mp3`);
  }
  for (let r = 1; r <= 88; r++) files.push(`rel${r}.mp3`);   // release tails
  return uniq(files).map(f => `static_assets/Salamander/${f}`);
}

// Open Sans is requested at runtime by WebFontLoader (which net-shim blocks) and
// is used for canvas-drawn control labels (`font = size + "px 'Open Sans'"`).
// Vendor the latin subsets locally + declare a local @font-face so those labels
// render correctly with zero external calls. The external request stays blocked.
async function vendorOpenSans() {
  const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  const fontRel = 'static_assets/fonts/opensans';
  const cssRel = 'local-fixes.css';
  const jsRel = 'local-fixes.js';
  console.log('Vendoring Open Sans (canvas label font)…');

  // 1. Pull the Google Fonts stylesheet (browser UA => woff2).
  const tmp = join(SITE_DIR, '.opensans.css.tmp');
  const {ok} = await execFileAsync('curl', [
    '-sS', '-L', '-A', BROWSER_UA, '-o', tmp,
    'https://fonts.googleapis.com/css?family=Open+Sans'
  ]).then(() => ({ok: true})).catch(() => ({ok: false}));
  let gcss = '';
  try { gcss = await readFile(tmp, 'utf8'); await unlink(tmp); } catch {}
  if (!ok || !gcss.includes('@font-face')) {
    console.warn('  could not fetch Open Sans CSS — skipping (net-shim still blocks the request).');
    return;
  }

  // 2. Keep only the latin + latin-ext @font-face blocks (canvas labels are ASCII).
  const blocks = gcss.split('/*').map(s => '/*' + s);
  const wanted = blocks.filter(b => /\/\*\s*latin(-ext)?\s*\*\//.test(b) && b.includes('@font-face'));
  let localCss = '/* Open Sans (latin) vendored locally for canvas control labels. */\n';
  for (const block of wanted) {
    const m = block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/);
    if (!m) continue;
    const fname = m[1].split('/').pop();
    const dest = `${fontRel}/${fname}`;
    if (!(await exists(join(OUT_DIR, dest)))) {
      const t = join(OUT_DIR, dest);
      await mkdir(dirname(t), {recursive: true});
      await execFileAsync('curl', ['-sS', '-L', '-A', BROWSER_UA, '-o', t, m[1]]);
      downloaded++;
    }
    localCss += block.replace(m[1], `/loop/${fontRel}/${fname}`).trim() + '\n';
  }
  await save(cssRel, Buffer.from(localCss, 'utf8'));

  // 3. Force the font to load so canvas draws with it (canvas ignores unused @font-face).
  await save(jsRel, Buffer.from(
    `// Ensure Open Sans is resident before any canvas widget draws its labels.\n` +
    `if (document.fonts && document.fonts.load) {\n` +
    `  try { document.fonts.load("16px 'Open Sans'"); } catch (e) {}\n` +
    `}\n`, 'utf8'));

  // 4. Wire both into the page.
  let html = await readFile(join(OUT_DIR, 'index.html'), 'utf8');
  if (!html.includes(cssRel)) {
    html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/loop/${cssRel}">\n  </head>`);
  }
  if (!html.includes(jsRel)) {
    html = html.replace(/<\/body>/i, `  <script src="/loop/${jsRel}"></script>\n  </body>`);
  }
  await save('index.html', Buffer.from(html, 'utf8'));
}

// Wire the hand-authored section-jump menu (nav.css / nav.js) into the page.
// The files themselves are checked in and NOT regenerated here — we only inject
// the references idempotently so a re-scrape keeps the menu.
async function injectNav() {
  if (!(await exists(join(OUT_DIR, 'nav.js'))) || !(await exists(join(OUT_DIR, 'nav.css')))) {
    console.warn('  nav.js / nav.css missing — skipping section-jump menu injection.');
    return;
  }
  let html = await readFile(join(OUT_DIR, 'index.html'), 'utf8');
  if (!html.includes('nav.css')) {
    html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/loop/nav.css">\n  </head>`);
  }
  if (!html.includes('nav.js')) {
    html = html.replace(/<\/body>/i, `  <script src="/loop/nav.js"></script>\n  </body>`);
  }
  await save('index.html', Buffer.from(html, 'utf8'));
}

async function main() {
  await mkdir(OUT_DIR, {recursive: true});

  // 1. The page itself.
  console.log('Fetching page HTML…');
  {
    const {buffer} = await fetchBuffer(ORIGIN + BASE_PATH);
    let html = buffer.toString('utf8');
    // Inject the defensive net-shim as the first thing in <head>.
    if (!html.includes('net-shim.js')) {
      html = html.replace(/<head\b[^>]*>/i, m => `${m}\n    <script src="/net-shim.js"></script>`);
    }
    await save('index.html', Buffer.from(html, 'utf8'));
    downloaded++;
  }
  const html = await readFile(join(OUT_DIR, 'index.html'), 'utf8');

  // 2. Core scripts + stylesheet referenced directly by the HTML.
  console.log('Fetching core scripts & CSS…');
  const cssName = (html.match(/href="(main\.[0-9a-f]+\.css)"/) || [])[1];
  const coreFiles = uniq([
    ...(cssName ? [cssName] : []),
    ...[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
      .map(m => m[1])
      .filter(h => !/^https?:/i.test(h) && !h.startsWith('/'))   // document-relative only (skip injected /net-shim.js)
  ]);
  await pool(coreFiles, f => grab(f));

  // 3. Hashed webpack assets referenced inside bundle.js and the CSS.
  console.log('Scanning bundle.js + CSS for hashed media…');
  let assetNames = [];
  for (const f of coreFiles.concat('index.html')) {
    const p = join(OUT_DIR, f);
    if (await exists(p)) assetNames.push(...hashedAssets(await readFile(p, 'utf8')));
  }
  assetNames = uniq(assetNames);
  console.log(`  ${assetNames.length} hashed assets`);
  await pool(assetNames, f => grab(f));

  // 4. Salamander piano samples (probe the full namespace, keep what exists).
  const salamander = salamanderCandidates();
  console.log(`Probing ${salamander.length} Salamander sample names…`);
  await pool(salamander, f => grab(f, {optional: true}));

  // 5. Vendor Open Sans for the canvas control labels.
  await vendorOpenSans();

  // 6. Section-jump menu (local-only convenience).
  await injectNav();

  // 7. net-shim lives at the server root so /net-shim.js resolves everywhere.
  const shimSrc = join(SITE_DIR, 'net-shim.js');
  if (!(await exists(shimSrc))) {
    console.warn('WARNING: site/net-shim.js missing — copy it before serving.');
  }

  console.log(`\nDone. Downloaded ${downloaded}, skipped ${skipped} existing.`);
  if (failed.length) {
    console.log(`\n${failed.length} required URLs failed:`);
    for (const f of failed.slice(0, 40)) console.log(`  - ${f}`);
    if (failed.length > 40) console.log(`  …and ${failed.length - 40} more`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
