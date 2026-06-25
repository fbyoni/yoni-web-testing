#!/usr/bin/env node
// populate-shop-recommendations.mjs
//
// The Shopify "Horizon" product pages render a "You may also like" block via a
// <product-recommendations> custom element that fetches /recommendations/products
// at runtime. Our mirror makes zero external calls, so that block stays stuck on
// its four skeleton placeholders forever.
//
// This step fetches the REAL rendered recommendations for each product from the
// live storefront (one section-render request per product), extracts the four
// product cards, localizes every asset + product link, downloads any missing
// images into the shared asset tree, and drops the cards into each page's
// existing grid wrapper (the skeleton block is configured as a 4-column
// resource-list--grid; that CSS is self-contained, whereas the endpoint's
// carousel variant needs slideshow-component JS we don't ship). It also flips
// data-recommendations-performed="true" so product-recommendations.js treats the
// block as already-loaded and never re-fetches (and wipes) it.
//
// Idempotent + rebuild-safe: operates on both site/ (served) and legacy/
// (archive); re-run after any scrape/deoptimize.

import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {existsSync, readdirSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname, join, resolve} from 'node:path';

const execFileAsync = promisify(execFile);

const ORIGIN = 'https://shop.247artists.com';
const ROOTS = ['site', 'legacy'].map(r => resolve(r)).filter(existsSync);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 247artists-local-mirror/1.0';

// Whole <product-recommendations> element (open attrs + inner).
const REC_RE = /<product-recommendations\b([\s\S]*?)>([\s\S]*?)<\/product-recommendations>/;
// Class tokens identifying, respectively, the grid wrapper that holds the
// skeleton/cards and each individual card. Both site/ and legacy/ are
// pretty-printed but legacy puts `class=` on a line of its own, so we locate by
// the class value and walk back to the owning <div rather than matching a single
// fixed "<div class=..." string.
const GRID_CLASS = 'resource-list resource-list--grid"';
const ITEM_CLASS = 'resource-list__item"';

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : '';
}

async function curlText(url) {
  const {stdout} = await execFileAsync('curl', ['-L', '-sS', '--fail', '-A', UA, url], {
    encoding: 'buffer',
    maxBuffer: 80 * 1024 * 1024,
  });
  return stdout.toString('utf8');
}

async function curlDownload(url, dest) {
  await mkdir(dirname(dest), {recursive: true});
  await execFileAsync('curl', ['-L', '-sS', '--fail', '-A', UA, '-o', dest, url], {
    maxBuffer: 80 * 1024 * 1024,
  });
}

// downloadUrl -> { host, path } collected during localization.
const assetsToFetch = new Map();

function localizeAssetUrl(raw) {
  const trimmed = raw.trim().replace(/&amp;/g, '&');
  const full = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  let url;
  try {
    url = new URL(full, ORIGIN);
  } catch {
    return raw;
  }
  if (!/(^|\.)shop\.247artists\.com$|(^|\.)shopifycdn\.com$|cdn\.shopify\.com$/.test(url.hostname)) {
    return raw;
  }
  const downloadUrl = `${url.origin}${url.pathname}`;
  assetsToFetch.set(downloadUrl, {host: url.hostname, path: url.pathname});
  return `/assets/${url.hostname}${url.pathname}`;
}

// /products/<handle>?variant=... (relative or absolute) -> /shop/products/<handle>/
function localizeProductHref(raw) {
  const m = raw.match(/\/products\/([a-z0-9-]+)/i);
  return m ? `/shop/products/${m[1]}/` : raw;
}

function localize(html) {
  let out = html;
  out = out.replace(/((?:srcset|imagesrcset)=")([^"]*)(")/gi, (_f, p, val, s) => {
    const r = val
      .split(',')
      .map(part => {
        const pieces = part.trim().split(/\s+/);
        if (pieces[0]) pieces[0] = localizeAssetUrl(pieces[0]);
        return pieces.join(' ');
      })
      .join(', ');
    return `${p}${r}${s}`;
  });
  out = out.replace(/((?:src|data-src|poster)=")([^"]+)(")/gi, (_f, p, v, s) => `${p}${localizeAssetUrl(v)}${s}`);
  out = out.replace(/(href=")([^"]+)(")/gi, (_f, p, v, s) => {
    if (/\/products\//i.test(v)) return `${p}${localizeProductHref(v)}${s}`;
    if (/\/(cdn\/shop|s\/files)\//i.test(v) || /shopifycdn\.com/i.test(v)) return `${p}${localizeAssetUrl(v)}${s}`;
    return `${p}${v}${s}`;
  });
  return out;
}

// Given a position inside/at a div's class attribute, return [start,end) of the
// full balanced <div>...</div> (handles nested <div>s and `class=` on its own
// line). `start` is the owning `<div`, `end` is just past its `</div>`.
function balancedDivAround(html, classPos) {
  const start = html.lastIndexOf('<div', classPos);
  if (start === -1) return null;
  const openEnd = html.indexOf('>', classPos) + 1;
  if (openEnd === 0) return null;
  let depth = 1;
  let i = openEnd;
  while (i < html.length && depth > 0) {
    const no = html.indexOf('<div', i);
    const nc = html.indexOf('</div>', i);
    if (nc === -1) break;
    if (no !== -1 && no < nc) {
      depth++;
      i = no + 4;
    } else {
      depth--;
      i = nc + 6;
    }
  }
  return {start, openEnd, end: i};
}

// Extract every balanced <div> whose class value starts with `classNeedle`.
function extractBlocks(html, classNeedle) {
  const blocks = [];
  let from = 0;
  while (true) {
    const cls = html.indexOf(classNeedle, from);
    if (cls === -1) break;
    const span = balancedDivAround(html, cls);
    if (!span) break;
    blocks.push(html.slice(span.start, span.end));
    from = span.end;
  }
  return blocks;
}

async function fetchRecommendationItems(sectionId, productId, intent) {
  const url =
    `${ORIGIN}/recommendations/products?section_id=${encodeURIComponent(sectionId)}` +
    `&product_id=${encodeURIComponent(productId)}&intent=${encodeURIComponent(intent || 'related')}&limit=4`;
  const html = await curlText(url);
  const items = extractBlocks(html, ITEM_CLASS);
  if (!items.length || items.some(it => it.includes('skeleton-item'))) return null;
  return items;
}

// Replace the inner content of the grid wrapper (the skeleton or stale cards)
// with the freshly fetched cards.
function injectIntoGrid(elementInner, itemsHtml) {
  const cls = elementInner.indexOf(GRID_CLASS);
  if (cls === -1) return null;
  const span = balancedDivAround(elementInner, cls);
  if (!span) return null;
  const closeStart = span.end - 6; // index of the matching </div>
  return `${elementInner.slice(0, span.openEnd)}\n${itemsHtml}\n${elementInner.slice(closeStart)}`;
}

function setPerformed(openAttrs) {
  if (/data-recommendations-performed="[^"]*"/.test(openAttrs)) {
    return openAttrs.replace(/data-recommendations-performed="[^"]*"/, 'data-recommendations-performed="true"');
  }
  return `${openAttrs} data-recommendations-performed="true"`;
}

function productDirs() {
  for (const root of ROOTS) {
    const dir = join(root, 'shop', 'products');
    if (existsSync(dir)) {
      return readdirSync(dir, {withFileTypes: true})
        .filter(d => d.isDirectory())
        .map(d => d.name);
    }
  }
  return [];
}

async function run() {
  if (!ROOTS.length) throw new Error('no site/ or legacy/ root found');
  const products = productDirs();
  console.log(`Found ${products.length} products across roots: ${ROOTS.map(r => r.split('/').pop()).join(', ')}`);

  let injected = 0;
  let skipped = 0;

  for (const handle of products) {
    // Read the recommendation element ids from whichever root has the page.
    let openAttrs = null;
    let productId = null;
    let sectionId = null;
    let intent = 'related';
    for (const root of ROOTS) {
      const file = join(root, 'shop', 'products', handle, 'index.html');
      if (!existsSync(file)) continue;
      const m = (await readFile(file, 'utf8')).match(REC_RE);
      if (!m) continue;
      openAttrs = m[1];
      productId = attr(openAttrs, 'data-product-id');
      sectionId = attr(openAttrs, 'data-section-id');
      intent = attr(openAttrs, 'data-intent') || 'related';
      break;
    }
    if (!productId || !sectionId) {
      console.log(`skip  ${handle} (no product-recommendations element)`);
      skipped++;
      continue;
    }

    let items;
    try {
      items = await fetchRecommendationItems(sectionId, productId, intent);
    } catch (e) {
      console.log(`FAIL  ${handle} fetch: ${e.message}`);
      skipped++;
      continue;
    }
    if (!items) {
      console.log(`skip  ${handle} (no cards returned)`);
      skipped++;
      continue;
    }

    const itemsHtml = localize(items.join('\n'));

    let wroteAny = false;
    for (const root of ROOTS) {
      const file = join(root, 'shop', 'products', handle, 'index.html');
      if (!existsSync(file)) continue;
      const html = await readFile(file, 'utf8');
      const replaced = html.replace(REC_RE, (full, attrs, inner) => {
        const newInner = injectIntoGrid(inner, itemsHtml);
        if (newInner == null) return full; // grid wrapper not found — leave untouched
        return `<product-recommendations${setPerformed(attrs)}>${newInner}</product-recommendations>`;
      });
      if (replaced !== html) {
        await writeFile(file, replaced);
        wroteAny = true;
      }
    }
    if (wroteAny) {
      console.log(`ok    ${handle} (${items.length} cards, product_id=${productId})`);
      injected++;
    } else {
      console.log(`skip  ${handle} (grid wrapper not found)`);
      skipped++;
    }
  }

  // Download any referenced asset not already present, into all roots.
  const downloads = [...assetsToFetch.entries()];
  let fetched = 0;
  let have = 0;
  for (const [downloadUrl, {host, path}] of downloads) {
    const rel = join('assets', host, ...path.split('/').filter(Boolean));
    const missing = ROOTS.map(root => join(root, rel)).filter(dest => !existsSync(dest));
    if (!missing.length) {
      have++;
      continue;
    }
    try {
      await curlDownload(downloadUrl, missing[0]);
      for (const dest of missing.slice(1)) {
        await mkdir(dirname(dest), {recursive: true});
        await execFileAsync('cp', [missing[0], dest]);
      }
      fetched++;
      console.log(`dl    ${downloadUrl}`);
    } catch (e) {
      console.log(`DLFAIL ${downloadUrl}: ${e.message}`);
    }
  }

  console.log(
    `\nDone. injected=${injected} skipped=${skipped} | assets: downloaded=${fetched} already-present=${have} referenced=${downloads.length}`,
  );
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
