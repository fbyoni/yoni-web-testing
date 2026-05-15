#!/usr/bin/env node
// Restore href="#shop" on the header navigation Shop link across every page.
// The site's navHandler binds the megamenu hover only when the anchor href
// contains a hash matching the dropdown id (#shop -> #shop dropdown). The
// scraper preserved the post-rewrite href on inner pages; this brings them
// back into a state the live JS can wire up.
//
// Touches ONLY the header nav link (class="header__nav__link ..."),
// leaving the footer "shop" link's href intact.

import {readFile, writeFile} from 'node:fs/promises';
import {readdirSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';

const ROOT = resolve('site');

function listHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listHtmlFiles(full));
    else if (st.isFile() && entry.endsWith('.html')) out.push(full);
  }
  return out;
}

const HEADER_SHOP_TAG = /<a\b([^>]*?\bclass="header__nav__link[^"]*"[^>]*?\baria-label="shop"[^>]*?)>/gs;

async function processFile(file) {
  const original = await readFile(file, 'utf8');
  let count = 0;
  const updated = original.replace(HEADER_SHOP_TAG, (full, attrs) => {
    const replaced = attrs.replace(/\bhref\s*=\s*"[^"]*"/, 'href="#shop"');
    if (replaced === attrs) return full;
    count++;
    return `<a${replaced}>`;
  });
  if (count > 0) await writeFile(file, updated, 'utf8');
  return count;
}

const files = listHtmlFiles(ROOT);
let total = 0;
for (const file of files) {
  const n = await processFile(file);
  if (n) {
    console.log(file.replace(ROOT + '/', ''), `→ ${n} replacement(s)`);
    total += n;
  }
}
console.log('---');
console.log('Files scanned:', files.length, '  Replacements:', total);
