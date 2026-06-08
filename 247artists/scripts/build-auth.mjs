#!/usr/bin/env node
// Build self-contained static replicas of the my.247artists.com /login and
// /signup pages from rendered-DOM snapshots captured with Puppeteer. The live
// pages are a React (Lovable/Vite) SPA; we snapshot the fully-rendered HTML,
// strip the SPA/analytics scripts, localize every asset (CSS, fonts, images),
// and layer a mock auth flow (auth-mock.js) that shows a success modal, sets a
// shared logged-in flag, and redirects to the main site.
//
// Inputs: /tmp/live-login.html, /tmp/live-signup.html (rendered outerHTML).
// Assets (styles css, fonts, logo, collage, favicon) are already mirrored under
// legacy/assets/my.247artists.com/ by the surrounding shell steps.

import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const OUT = resolve('legacy');
const RUNTIME = join(dirname(fileURLToPath(import.meta.url)), 'runtime');

function transform(html, kind) {
  let out = html;

  // Drop the SPA / analytics scripts — the snapshot DOM is already rendered.
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, '');

  // Drop module/script preloads for the (now-removed) SPA bundle, else the
  // browser 404s fetching JS chunks we intentionally don't mirror.
  out = out.replace(/<link\b[^>]*\brel=["'](?:modulepreload|preload)["'][^>]*>/gi, (tag) => {
    if (/\brel=["']modulepreload["']/i.test(tag)) return '';
    if (/\bas=["']script["']/i.test(tag) || /href=["'][^"']*\.js[?"']/i.test(tag)) return '';
    return tag; // keep image/style/font preloads
  });

  // Localize root-relative asset refs (my.247artists.com served them from
  // /assets/... and /favicon.ico) into our host-prefixed mirror tree.
  out = out.replace(/(["'(])\/assets\//g, '$1/assets/my.247artists.com/assets/');
  out = out.replace(/(["'])\/favicon\.ico/g, '$1/assets/my.247artists.com/favicon.ico');

  // Google Fonts stylesheet -> local vendored fonts.css
  out = out.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/gi,
    '<link rel="stylesheet" href="/assets/my.247artists.com/fonts.css">');

  // Internal auth nav between the two pages -> our local routes.
  out = out.replace(/href="\/signup(\?[^"]*)?"/g, 'href="/signup/"');
  out = out.replace(/href="\/login(\?[^"]*)?"/g, 'href="/login/"');

  // net-shim first in <head> (defense-in-depth against any missed off-origin).
  out = out.replace(/(<head[^>]*>)/i, '$1\n<script src="/net-shim.js"></script>');

  // Mock auth layer.
  out = out.replace(/<\/head>/i, '<link rel="stylesheet" href="/auth-mock.css">\n</head>');
  out = out.replace(/<\/body>/i,
    `<script>window.__AUTH_KIND=${JSON.stringify(kind)};</script>\n<script src="/auth-mock.js"></script>\n</body>`);

  if (!/^<!doctype/i.test(out)) out = '<!doctype html>\n' + out;
  return out;
}

for (const kind of ['login', 'signup']) {
  const src = await readFile(`/tmp/live-${kind}.html`, 'utf8');
  const html = transform(src, kind);
  const target = join(OUT, kind, 'index.html');
  await mkdir(dirname(target), {recursive: true});
  await writeFile(target, html);
  console.log(`wrote ${target} (${html.length} bytes)`);
}

// Copy runtime mock files into the served archive root.
for (const f of ['auth-mock.js', 'auth-mock.css']) {
  await copyFile(join(RUNTIME, f), join(OUT, f));
}
console.log('copied auth-mock.js / auth-mock.css into legacy/');
