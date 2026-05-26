#!/usr/bin/env node
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {statSync} from 'node:fs';
import {join, resolve} from 'node:path';

const ROOT = resolve('site');

function attrValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2] ?? '') : null;
}

function isExternalUrl(value) {
  return /^https?:\/\//i.test(value || '') || /^\/\//.test(value || '');
}

async function listHtmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...await listHtmlFiles(full));
    } else if (st.isFile() && entry.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function neutralizeExternalMedia(html, log) {
  return html.replace(/<(img|iframe|source|video|audio|track|embed)\b([^>]*)>/gi, (tag, name, attrs) => {
    const src = attrValue(tag, 'src');
    if (!isExternalUrl(src)) return tag;
    log.media++;
    return `<${name}${attrs.replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*')/i, 'src=""')}>`;
  });
}

function neutralizeExternalAnchors(html, log) {
  return html.replace(/<a\b([^>]*)>/gi, (tag, attrs) => {
    const href = attrValue(tag, 'href');
    if (!isExternalUrl(href)) return tag;
    log.anchors++;
    return `<a${attrs.replace(/\bhref\s*=\s*(?:"[^"]*"|'[^']*')/i, 'href="#"')}>`;
  });
}

function stripExternalResourceTags(html, log) {
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attrValue(tag, 'href');
    const rel = (attrValue(tag, 'rel') || '').toLowerCase();
    if (!isExternalUrl(href)) return tag;
    if (/\b(?:canonical|alternate)\b/.test(rel)) {
      return tag.replace(/\bhref\s*=\s*(?:"[^"]*"|'[^']*')/i, 'href="/tracingart/"');
    }
    log.links++;
    return '';
  });

  html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*["'][^>]*>\s*<\/script>/gi, (tag) => {
    const src = attrValue(tag, 'src');
    if (!isExternalUrl(src)) return tag;
    log.scripts++;
    return '';
  });

  return html;
}

function disablePlausibleConfig(html) {
  return html
    .replace(/plausible:\{enabled:true,/g, 'plausible:{enabled:false,')
    .replace(/apiHost:"https:\/\/static\.getty\.edu"/g, 'apiHost:""')
    .replace(/trackLocalhost:"[^"]*"/g, 'trackLocalhost:""');
}

async function processFile(file) {
  const before = await readFile(file, 'utf8');
  const log = {links: 0, scripts: 0, media: 0, anchors: 0};
  let after = before;
  after = stripExternalResourceTags(after, log);
  after = neutralizeExternalMedia(after, log);
  after = neutralizeExternalAnchors(after, log);
  after = disablePlausibleConfig(after);
  if (after !== before) {
    await writeFile(file, after);
  }
  return log;
}

const totals = {links: 0, scripts: 0, media: 0, anchors: 0};
for (const file of await listHtmlFiles(ROOT)) {
  const log = await processFile(file);
  for (const key of Object.keys(totals)) totals[key] += log[key];
  if (Object.values(log).some(Boolean)) {
    console.log(file.replace(ROOT + '/', ''), log);
  }
}
console.log('---');
console.log('Totals:', totals);
