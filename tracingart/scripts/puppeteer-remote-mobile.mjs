#!/usr/bin/env node
import {writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const browserURL = process.env.BROWSER_URL || 'http://127.0.0.1:9222';
const targetURL = process.env.TARGET_URL || 'http://localhost:5173/tracingart/';
const viewport = {width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true};
const reportDir = process.env.REPORT_DIR || 'site';
const targetHost = new URL(targetURL).host;
const targetPort = new URL(targetURL).port || (new URL(targetURL).protocol === 'https:' ? '443' : '80');
const allowedHosts = new Set([targetHost, `localhost:${targetPort}`, `127.0.0.1:${targetPort}`]);
const screenshot = `${reportDir}/puppeteer-mobile-smoke.png`;
const reportPath = `${reportDir}/puppeteer-mobile-report.json`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function hostFor(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

const browser = await puppeteer.connect({browserURL});
const page = await browser.newPage();
await page.setViewport(viewport);
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

const external = [];
const failed = [];
const localErrors = [];
const consoleMessages = [];

await page.evaluateOnNewDocument(() => {
  const block = () => undefined;
  window.open = block;
  if (window.location) {
    window.location.assign = block;
    window.location.replace = block;
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
  failed.push({url: request.url(), failure: request.failure()?.errorText || 'unknown'});
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

await page.goto(targetURL, {waitUntil: 'networkidle2', timeout: 60000});

const samples = [];
const initialHeight = await page.evaluate(() => document.documentElement.scrollHeight);
const positions = [0, 900, 2200, 5200, 12000, Math.max(0, initialHeight - viewport.height)];

for (const position of positions) {
  const currentScroll = await page.evaluate(() => window.scrollY || 0);
  const direction = position >= currentScroll ? 1 : -1;
  for (let y = currentScroll; direction > 0 ? y < position : y > position; y += 180 * direction) {
    const next = direction > 0 ? Math.min(y + 180, position) : Math.max(y - 180, position);
    await page.evaluate(nextY => window.scrollTo(0, nextY), next);
    await sleep(60);
  }
  await sleep(1500);
  samples.push(await page.evaluate(position => {
    const viewportWidth = window.innerWidth;
    const offenders = [...document.body.querySelectorAll('*')]
      .map(el => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === 'string' ? el.className : '',
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height
        };
      })
      .filter(item => item.width > 1 && item.height > 1 && (item.left < -2 || item.right > viewportWidth + 2))
      .slice(0, 20);

    const visibleTextBlocks = [...document.querySelectorAll('h1,h2,h3,p,button')]
      .map(el => {
        const rect = el.getBoundingClientRect();
        const styles = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === 'string' ? el.className : '',
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
          rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
          transform: styles.transform,
          translate: styles.translate,
          visibility: styles.visibility,
          opacity: styles.opacity
        };
      })
      .filter(item => item.rect.height > 1 && item.rect.y > -20 && item.rect.y < window.innerHeight + 20)
      .slice(0, 12);

    return {
      scrollPosition: position,
      actualScrollY: window.scrollY,
      bodyHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth,
      horizontalOverflow: document.documentElement.scrollWidth > viewportWidth + 2,
      overflowOffenders: offenders,
      visibleTextBlocks,
      activeSection: document.querySelector('[class*="section"][class*="active"]')?.className || ''
    };
  }, position));
}

await page.screenshot({path: screenshot, fullPage: false});

const result = await page.evaluate(() => ({
  title: document.title,
  h1: document.querySelector('h1')?.textContent?.trim() || '',
  imageCount: document.images.length,
  completeImages: [...document.images].filter(img => img.complete && img.naturalWidth > 0).length,
  externalAnchors: [...document.querySelectorAll('a[href^="http"]')].length,
  bodyHeight: document.documentElement.scrollHeight,
  scrollWidth: document.documentElement.scrollWidth,
  viewportWidth: window.innerWidth
}));

await page.close();
await browser.disconnect();

const overflowSamples = samples.filter(sample => sample.horizontalOverflow);
const report = {
  ok: external.length === 0 &&
    failed.length === 0 &&
    localErrors.length === 0 &&
    overflowSamples.length === 0 &&
    consoleMessages.length === 0,
  targetURL,
  viewport,
  screenshot,
  result,
  samples,
  external,
  failed,
  localErrors,
  overflowSamples,
  consoleMessages
};

await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
