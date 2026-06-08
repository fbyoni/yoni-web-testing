#!/usr/bin/env node
// Copy the runtime guard files (net-shim + local-fixes) into the archive root,
// then inject net-shim as the first child of <head> on every page and the
// local-fixes bundle (CSS + JS) at the end of <head>/<body>. Idempotent — safe
// to re-run after each scrape/clean pass, and self-contained: the guard files
// live in scripts/runtime/ so a fresh `scrape` (which wipes legacy/) loses
// nothing.

import {copyFile, readFile, writeFile} from 'node:fs/promises';
import {readdirSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Operates on the raw minified archive (legacy/); the readable served copy in
// site/ is regenerated from it by `npm run deoptimize`.
const ROOT = resolve('legacy');
const RUNTIME_DIR = join(dirname(fileURLToPath(import.meta.url)), 'runtime');
const SHIM_TAG = '<script src="/net-shim.js"></script>';
const FIXES_CSS = '<link rel="stylesheet" href="/local-fixes.css">';
const FIXES_JS = '<script src="/local-fixes.js"></script>';

// Ensure the guard files exist at the archive root before wiring them in.
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

  // net-shim first in <head>
  if (!html.includes('net-shim.js')) {
    html = html.replace(/(<head\b[^>]*>)/i, (m) => `${m}\n${SHIM_TAG}`);
    shimCount++;
  }

  // local-fixes css before </head>, js before </body>
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
