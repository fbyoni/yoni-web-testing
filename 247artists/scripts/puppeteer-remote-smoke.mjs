#!/usr/bin/env node
// Connect to an already-running Chrome (remote debugging on :9222) and verify
// that every local page loads with ZERO external requests, zero failed
// requests, and zero local 4xx/5xx. Slow-scrolls each page so lazy assets fire.
//
// Launch Chrome once from a real Terminal first:
//   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
//     --remote-debugging-port=9222 --user-data-dir=$HOME/Chrome-Debug

import {writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const browserURL = process.env.BROWSER_URL || 'http://127.0.0.1:9222';
const base = process.env.BASE_URL || 'http://localhost:5173';
const reportPath = process.env.REPORT_PATH || 'puppeteer-remote-report.json';
const screenshot = process.env.SCREENSHOT || 'puppeteer-remote-smoke.png';

const basePort = new URL(base).port || '80';
const allowedHosts = new Set([
  new URL(base).host,
  `localhost:${basePort}`,
  `127.0.0.1:${basePort}`,
]);

// Pages to verify (relative paths). Sourced from the live sitemap.
const PAGES = [
  '/',
  '/about-us/',
  '/memberships/',
  '/join-now/',
  '/workshops/',
  '/mentor/',
  '/events/',
  '/terms-privacy/',
  '/legal-notice/',
  '/legal-notice/dropopenverse2025/',
  '/blog/',
  '/this-is-the-drop/',
  '/why-we-started-24-7-artists/',
  '/ai-music-is-coming-but-whos-getting-paid/',
  '/tate-financial-tools/',
  '/music-funding-for-independent-artists-grants-crowdfunding-and-more/',
  '/social-media-strategies-for-independent-musicians-grow-your-audience-online/',
  '/how-to-get-your-music-featured-on-spotify-playlists-and-music-blogs/',
  '/event/workshop-grow-your-audience-in-2026/',
  '/event/workshop-your-2026-music-career-plan/',
  '/event/artist-showcase-kelkoe-x-nim-live/',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function hostFor(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

const browser = await puppeteer.connect({browserURL});

const perPage = [];
const allExternal = [];
const allFailed = [];
const allLocalErrors = [];
const allConsole = [];

for (const path of PAGES) {
  const target = base + path;
  const page = await browser.newPage();
  await page.setViewport({width: 1440, height: 900, deviceScaleFactor: 1});

  const external = [];
  const failed = [];
  const localErrors = [];
  const consoleMessages = [];

  await page.evaluateOnNewDocument(() => {
    const block = () => undefined;
    window.open = block;
    if (window.location) {
      try {
        window.location.assign = block;
        window.location.replace = block;
      } catch (_) {}
    }
    document.addEventListener('click', event => {
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href) && !href.includes(location.host)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  });

  page.on('request', request => {
    const url = request.url();
    const host = hostFor(url);
    if (host && !allowedHosts.has(host) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push({method: request.method(), url});
    }
  });
  page.on('requestfailed', request => {
    const url = request.url();
    // Ignore failures for off-host requests the net-shim deliberately aborts.
    if (allowedHosts.has(hostFor(url))) {
      failed.push({url, failure: request.failure()?.errorText || 'unknown'});
    }
  });
  page.on('response', response => {
    const url = response.url();
    if (allowedHosts.has(hostFor(url)) && response.status() >= 400) {
      localErrors.push({status: response.status(), url});
    }
  });
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) {
      consoleMessages.push({type: message.type(), text: message.text().slice(0, 300)});
    }
  });

  try {
    await page.goto(target, {waitUntil: 'networkidle2', timeout: 60000});
  } catch (e) {
    failed.push({url: target, failure: `goto: ${e.message}`});
  }

  // Slow-scroll to trigger lazy-loaded images/sections.
  const height = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => 0);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate(p => window.scrollTo(0, p), y).catch(() => {});
    await sleep(150);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => {});
  await sleep(800);
  // settle network after lazy loads
  try {
    await page.waitForNetworkIdle({idleTime: 600, timeout: 8000});
  } catch (_) {}

  const info = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 100) || '',
    images: document.images.length,
    completeImages: [...document.images].filter(img => img.complete && img.naturalWidth > 0).length,
    brokenImages: [...document.images].filter(img => img.src && (!img.complete || img.naturalWidth === 0)).map(i => i.src).slice(0, 20),
  })).catch(() => ({}));

  if (path === '/') {
    try {
      await page.screenshot({path: screenshot, fullPage: true});
    } catch (_) {}
  }

  await page.close();

  const ok = external.length === 0 && failed.length === 0 && localErrors.length === 0;
  perPage.push({path, ok, info, external, failed, localErrors, consoleMessages});
  allExternal.push(...external.map(e => ({path, ...e})));
  allFailed.push(...failed.map(e => ({path, ...e})));
  allLocalErrors.push(...localErrors.map(e => ({path, ...e})));
  allConsole.push(...consoleMessages.map(e => ({path, ...e})));

  console.log(`${ok ? 'OK ' : 'FAIL'} ${path}  ext=${external.length} failed=${failed.length} local4xx=${localErrors.length} imgs=${info.completeImages}/${info.images}`);
}

await browser.disconnect();

const report = {
  ok: allExternal.length === 0 && allFailed.length === 0 && allLocalErrors.length === 0,
  base,
  pagesChecked: PAGES.length,
  external: allExternal,
  failed: allFailed,
  localErrors: allLocalErrors,
  perPage,
};

await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify({ok: report.ok, external: allExternal.length, failed: allFailed.length, localErrors: allLocalErrors.length}, null, 2));
if (!report.ok) {
  console.log('\nExternal:', JSON.stringify([...new Set(allExternal.map(e => e.url))].slice(0, 40), null, 2));
  console.log('Failed:', JSON.stringify([...new Set(allFailed.map(e => e.url))].slice(0, 40), null, 2));
  console.log('Local 4xx/5xx:', JSON.stringify([...new Set(allLocalErrors.map(e => `${e.status} ${e.url}`))].slice(0, 60), null, 2));
}
process.exit(report.ok ? 0 : 1);
