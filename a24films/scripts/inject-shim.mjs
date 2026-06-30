#!/usr/bin/env node
// Copy the runtime guard files (net-shim + local-fixes) into the served site/
// root, then inject net-shim as the FIRST child of <head> on every page (so it
// patches network primitives before any bundle runs) and the local-fixes
// bundle (CSS at end of <head>, JS at end of <body>). Idempotent — safe to
// re-run after each scrape/clean pass. The guard sources live in
// scripts/runtime/ so a fresh scrape never loses them.

import {copyFile, readFile, writeFile} from 'node:fs/promises';
import {readdirSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve('site');
const RUNTIME_DIR = join(dirname(fileURLToPath(import.meta.url)), 'runtime');
const SHIM_TAG = '<script src="/net-shim.js"></script>';
const FIXES_CSS = '<link rel="stylesheet" href="/local-fixes.css">';
const FIXES_JS = '<script src="/local-fixes.js"></script>';
// The mirrored Adobe Typekit font stylesheet (akzidenz-grotesk). Fully local —
// its @import/@font-face resolve to mirrored woff2 files. Re-inserted here
// because it lives off-origin in the source and an over-eager external strip
// could drop it; keeping this in the (idempotent) shim step guarantees the
// site's typography survives every clean pass.
const FONT_CSS_PATH = '/assets/use.typekit.net/ewm3ygz.css';
const FONT_CSS_TAG = `<link rel="stylesheet" href="${FONT_CSS_PATH}">`;

for (const name of ['net-shim.js', 'local-fixes.css', 'local-fixes.js']) {
  await copyFile(join(RUNTIME_DIR, name), join(ROOT, name));
}

function listHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listHtml(full));
    else if (st.isFile() && entry.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = listHtml(ROOT);
let shimCount = 0;
let fixesCount = 0;

for (const file of files) {
  let html = await readFile(file, 'utf8');
  const before = html;

  if (!html.includes('net-shim.js')) {
    html = html.replace(/(<head\b[^>]*>)/i, (m) => `${m}\n${SHIM_TAG}`);
    shimCount++;
  }
  // Restore the local font stylesheet if a clean pass removed it.
  if (!html.includes(FONT_CSS_PATH)) {
    html = html.replace(/<\/head>/i, `${FONT_CSS_TAG}\n</head>`);
  }
  if (!html.includes('local-fixes.css')) {
    html = html.replace(/<\/head>/i, `${FIXES_CSS}\n</head>`);
    fixesCount++;
  }
  if (!html.includes('local-fixes.js')) {
    html = html.replace(/<\/body>/i, `${FIXES_JS}\n</body>`);
  }

  if (html !== before) await writeFile(file, html, 'utf8');
}

console.log(`Injected net-shim into ${shimCount} pages, local-fixes into ${fixesCount} pages (of ${files.length} total).`);
