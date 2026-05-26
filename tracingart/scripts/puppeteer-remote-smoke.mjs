#!/usr/bin/env node
import {writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const browserURL = process.env.BROWSER_URL || 'http://127.0.0.1:9222';
const targetURL = process.env.TARGET_URL || 'http://localhost:5173/tracingart/';
const reportDir = process.env.REPORT_DIR || 'site';
const targetHost = new URL(targetURL).host;
const targetPort = new URL(targetURL).port || (new URL(targetURL).protocol === 'https:' ? '443' : '80');
const allowedHosts = new Set([targetHost, `localhost:${targetPort}`, `127.0.0.1:${targetPort}`]);
const screenshot = `${reportDir}/puppeteer-remote-smoke.png`;
const reportPath = `${reportDir}/puppeteer-remote-report.json`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function hostFor(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function elementProbe(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const styles = getComputedStyle(el);
  return {
    selector,
    text: (el.textContent || '').trim().slice(0, 80),
    className: el.className || '',
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    transform: styles.transform,
    translate: styles.translate,
    opacity: styles.opacity,
    visibility: styles.visibility
  };
}

const browser = await puppeteer.connect({browserURL});
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
const positions = [0, 1200, 3600, 7200, 12000, Math.max(0, initialHeight - 900)];

for (const position of positions) {
  const currentScroll = await page.evaluate(() => window.scrollY || 0);
  for (let y = currentScroll; y < position; y += 200) {
    await page.evaluate(nextY => window.scrollTo(0, nextY), Math.min(y + 200, position));
    await sleep(60);
  }
  await page.evaluate(y => window.scrollTo(0, y), position);
  await sleep(1500);
  samples.push(await page.evaluate(({position, elementProbeText}) => {
    const probe = new Function(`return (${elementProbeText})`)();
    return {
      scrollPosition: position,
      actualScrollY: window.scrollY,
      bodyHeight: document.documentElement.scrollHeight,
      h1: probe('h1'),
      nav: probe('.nav'),
      visibleImage: probe('picture img:not([src=""])'),
      activeSection: document.querySelector('[class*="section"][class*="active"]')?.className || ''
    };
  }, {position, elementProbeText: elementProbe.toString()}));
}

try {
  await page.screenshot({path: screenshot, fullPage: true});
} catch {
  await page.screenshot({path: screenshot, fullPage: false});
}

const result = await page.evaluate(() => ({
  title: document.title,
  h1: document.querySelector('h1')?.textContent?.trim() || '',
  bodySample: document.body.innerText.slice(0, 260),
  imageCount: document.images.length,
  completeImages: [...document.images].filter(img => img.complete && img.naturalWidth > 0).length,
  scriptCount: document.scripts.length,
  externalAnchors: [...document.querySelectorAll('a[href^="http"]')].length,
  neutralizedAnchors: [...document.querySelectorAll('a[data-local-neutralized="true"]')].length,
  scrollY: window.scrollY
}));

await page.close();
await browser.disconnect();

const report = {
  ok: external.length === 0 && failed.length === 0 && localErrors.length === 0,
  targetURL,
  screenshot,
  result,
  samples,
  external,
  failed,
  localErrors,
  consoleMessages
};

await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
