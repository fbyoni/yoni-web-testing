#!/usr/bin/env node
// verify-shop.mjs — connect to the already-running Chrome (remote debugging on
// :9222) and verify the mocked shop is fully self-contained AND the cart flow
// works. Model: scripts/puppeteer-remote-smoke.mjs.
//
// For the shop home + collection + >=2 product pages, asserts per page:
//   - 0 external requests (only localhost)
//   - 0 failed local requests
//   - 0 local 4xx/5xx
//   - product images load (completeImages == images, minus intentional blanks)
//   - prices render
// Then drives the cart flow on the home page: add 2 items, change a qty, open
// the cart, checkout, assert success modal, dismiss, assert cart empty again.
// Screenshots the shop home to legacy/shop-smoke.png.
//
//   Serve legacy first:  SITE_DIR=legacy PORT=5283 node server.mjs &

import {writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const browserURL = process.env.BROWSER_URL || 'http://127.0.0.1:9222';
const base = process.env.BASE_URL || 'http://localhost:5283';
const reportPath = process.env.REPORT_PATH || 'verify-shop-report.json';
const screenshot = process.env.SCREENSHOT || 'legacy/shop-smoke.png';

const basePort = new URL(base).port || '80';
const allowedHosts = new Set([
  new URL(base).host,
  `localhost:${basePort}`,
  `127.0.0.1:${basePort}`,
]);

const PAGES = [
  '/shop/',
  '/shop/collections/all/',
  '/shop/products/i-am-an-artist-24-7-premium-eco-hoodie/',
  '/shop/products/dad-hat/',
  '/shop/products/artist-tote-bag/',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostFor = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

function instrument(page, bag) {
  page.on('request', (req) => {
    const url = req.url();
    const host = hostFor(url);
    if (host && !allowedHosts.has(host) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      bag.external.push({method: req.method(), url});
    }
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (allowedHosts.has(hostFor(url))) {
      bag.failed.push({url, failure: req.failure()?.errorText || 'unknown'});
    }
  });
  page.on('response', (res) => {
    const url = res.url();
    if (allowedHosts.has(hostFor(url)) && res.status() >= 400) {
      bag.localErrors.push({status: res.status(), url});
    }
  });
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) {
      bag.console.push({type: m.type(), text: m.text().slice(0, 200)});
    }
  });
}

async function scrollThrough(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => 0);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((p) => window.scrollTo(0, p), y).catch(() => {});
    await sleep(120);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => {});
  await sleep(500);
  try {
    await page.waitForNetworkIdle({idleTime: 500, timeout: 6000});
  } catch (_) {}
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
}

const browser = await puppeteer.connect({browserURL});
const perPage = [];

for (const path of PAGES) {
  const page = await browser.newPage();
  await page.setViewport({width: 1440, height: 900, deviceScaleFactor: 1});
  const bag = {external: [], failed: [], localErrors: [], console: []};
  instrument(page, bag);

  try {
    await page.goto(base + path, {waitUntil: 'networkidle2', timeout: 60000});
  } catch (e) {
    bag.failed.push({url: base + path, failure: `goto: ${e.message}`});
  }
  await scrollThrough(page);

  const info = await page
    .evaluate(() => {
      const imgs = [...document.images];
      const blanked = imgs.filter((i) => !i.getAttribute('src'));
      const meaningful = imgs.filter((i) => i.getAttribute('src'));
      const complete = meaningful.filter((i) => i.complete && i.naturalWidth > 0);
      const broken = meaningful
        .filter((i) => !(i.complete && i.naturalWidth > 0))
        .map((i) => i.currentSrc || i.src)
        .slice(0, 15);
      const priceEls = [...document.querySelectorAll('.price, .price-item, [class*="price"]')]
        .map((e) => e.textContent.trim())
        .filter((t) => /\$\s?\d/.test(t));
      return {
        title: document.title,
        images: meaningful.length,
        blanked: blanked.length,
        completeImages: complete.length,
        brokenImages: broken,
        priceCount: priceEls.length,
        samplePrice: priceEls[0] || '',
      };
    })
    .catch(() => ({}));

  if (path === '/shop/') {
    try {
      await page.screenshot({path: screenshot, fullPage: true});
    } catch (_) {}
  }

  await page.close();

  const imagesOk = info.images > 0 && info.completeImages === info.images;
  const pricesOk = (info.priceCount || 0) > 0;
  const ok =
    bag.external.length === 0 &&
    bag.failed.length === 0 &&
    bag.localErrors.length === 0 &&
    imagesOk &&
    pricesOk;
  perPage.push({path, ok, imagesOk, pricesOk, info, ...bag});
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${path}  ext=${bag.external.length} failed=${bag.failed.length} 4xx=${bag.localErrors.length} imgs=${info.completeImages}/${info.images} prices=${info.priceCount}`
  );
  if (!ok) {
    if (bag.external.length) console.log('   external:', [...new Set(bag.external.map((e) => e.url))].slice(0, 10));
    if (bag.failed.length) console.log('   failed:', [...new Set(bag.failed.map((e) => e.url))].slice(0, 10));
    if (bag.localErrors.length) console.log('   4xx:', [...new Set(bag.localErrors.map((e) => `${e.status} ${e.url}`))].slice(0, 10));
    if (!imagesOk) console.log('   broken imgs:', info.brokenImages);
    if (!pricesOk) console.log('   no prices found');
  }
}

// ---- cart flow on the shop home ------------------------------------------
const cartResult = {steps: [], ok: false};
function step(name, pass, detail) {
  cartResult.steps.push({name, pass, detail});
  console.log(`   ${pass ? 'ok ' : 'XX '} ${name}${detail ? ' — ' + detail : ''}`);
  return pass;
}

{
  console.log('\n=== CART FLOW (/shop/) ===');
  const page = await browser.newPage();
  await page.setViewport({width: 1440, height: 900, deviceScaleFactor: 1});
  const bag = {external: [], failed: [], localErrors: [], console: []};
  instrument(page, bag);
  await page.goto(base + '/shop/', {waitUntil: 'networkidle2', timeout: 60000});
  await page.evaluate(() => localStorage.removeItem('mockCart247'));
  await page.reload({waitUntil: 'networkidle2'});

  // The theme's add buttons are web-component-overlaid, so submit the cart/add
  // forms programmatically (requestSubmit fires our capture-phase interceptor).
  const formCount = await page.$$eval('form[action*="/cart/add"]', (fs) => fs.length);
  step('found add-to-cart forms', formCount >= 2, `count=${formCount}`);

  await page.evaluate(() => {
    const f = document.querySelectorAll('form[action*="/cart/add"]')[0];
    f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
  });
  await sleep(500);
  let count = await page.evaluate(() => JSON.parse(localStorage.getItem('mockCart247') || '[]').reduce((n, i) => n + i.qty, 0));
  step('add item 1 -> qty 1', count === 1, `qty=${count}`);

  // Close drawer if open, add a different item.
  await page.evaluate(() => {
    const c = document.querySelector('.mock-cart-close');
    if (c) c.click();
  });
  await sleep(300);
  await page.evaluate(() => {
    // pick a form for a different product than the first
    const forms = [...document.querySelectorAll('form[action*="/cart/add"]')];
    const firstId = forms[0].querySelector('input[name="id"]').value;
    const other = forms.find((f) => f.querySelector('input[name="id"]').value !== firstId) || forms[1];
    other.requestSubmit ? other.requestSubmit() : other.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
  });
  await sleep(500);
  let lines = await page.evaluate(() => JSON.parse(localStorage.getItem('mockCart247') || '[]').length);
  step('add item 2 -> 2 distinct lines', lines === 2, `lines=${lines}`);

  // Open cart (drawer should already be open from add; ensure open).
  await page.evaluate(() => {
    const d = document.querySelector('.mock-cart-drawer');
    if (!d || !d.classList.contains('is-open')) {
      const b = document.querySelector('cart-drawer-component button[aria-label^="Open cart"], button[aria-label^="Open cart"]');
      if (b) b.click();
    }
  });
  await sleep(400);
  const drawerOpen = await page.evaluate(() => !!document.querySelector('.mock-cart-drawer.is-open'));
  step('cart drawer opens', drawerOpen);

  // Increment qty on first line.
  await page.evaluate(() => {
    const inc = document.querySelector('.mock-line [data-act="inc"]');
    if (inc) inc.click();
  });
  await sleep(300);
  count = await page.evaluate(() => JSON.parse(localStorage.getItem('mockCart247') || '[]').reduce((n, i) => n + i.qty, 0));
  step('increment qty -> total 3', count === 3, `qty=${count}`);

  // Badge reflects count.
  const badge = await page.evaluate(() => {
    const el = document.getElementById('mock-cart-count');
    return el ? el.textContent : null;
  });
  step('header badge updates', badge === '3', `badge=${badge}`);

  // Subtotal renders.
  const subtotal = await page.evaluate(() => {
    const el = document.querySelector('.mock-cart-subtotal-val');
    return el ? el.textContent : '';
  });
  step('subtotal renders', /\$\d/.test(subtotal), subtotal);

  // Checkout.
  await page.evaluate(() => document.querySelector('.mock-cart-checkout').click());
  await sleep(500);
  const modalShown = await page.evaluate(() => !!document.querySelector('.mock-checkout-modal'));
  step('checkout success modal appears', modalShown);

  // Dismiss -> cart empty.
  await page.evaluate(() => document.querySelector('.mock-checkout-done').click());
  await sleep(400);
  const afterLen = await page.evaluate(() => JSON.parse(localStorage.getItem('mockCart247') || '[]').length);
  step('cart reset to empty after dismiss', afterLen === 0, `lines=${afterLen}`);
  const badgeAfter = await page.evaluate(() => {
    const el = document.getElementById('mock-cart-count');
    return el ? el.style.display : 'gone';
  });
  step('badge hidden after reset', badgeAfter === 'none' || badgeAfter === 'gone', `display=${badgeAfter}`);

  const cartClean = bag.external.length === 0 && bag.failed.length === 0 && bag.localErrors.length === 0;
  step('cart flow: no external/failed/4xx', cartClean,
    `ext=${bag.external.length} failed=${bag.failed.length} 4xx=${bag.localErrors.length}`);
  cartResult.bag = bag;
  if (!cartClean) {
    if (bag.external.length) console.log('   cart external:', [...new Set(bag.external.map((e) => e.url))].slice(0, 10));
    if (bag.failed.length) console.log('   cart failed:', [...new Set(bag.failed.map((e) => e.url))].slice(0, 10));
    if (bag.localErrors.length) console.log('   cart 4xx:', [...new Set(bag.localErrors.map((e) => `${e.status} ${e.url}`))].slice(0, 10));
  }

  await page.close();
  cartResult.ok = cartResult.steps.every((s) => s.pass);
}

await browser.disconnect();

const pagesOk = perPage.every((p) => p.ok);
const report = {ok: pagesOk && cartResult.ok, base, perPage, cartResult};
await writeFile(reportPath, JSON.stringify(report, null, 2));

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify({
  pagesOk,
  cartOk: cartResult.ok,
  overall: report.ok,
  totalExternal: perPage.reduce((n, p) => n + p.external.length, 0),
  totalFailed: perPage.reduce((n, p) => n + p.failed.length, 0),
  totalLocal4xx: perPage.reduce((n, p) => n + p.localErrors.length, 0),
}, null, 2));
process.exit(report.ok ? 0 : 1);
