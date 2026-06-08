#!/usr/bin/env node
// Verify the mocked /login/ route by connecting to an already-running Chrome
// (remote debugging on :9222). Asserts zero external requests, zero failed
// requests, zero local 4xx/5xx, zero console errors, and drives the login flow.

import {writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const browserURL = process.env.BROWSER_URL || 'http://127.0.0.1:9222';
const base = process.env.BASE_URL || 'http://localhost:5281';
const screenshot = process.env.SCREENSHOT || 'legacy/login-smoke.png';
const target = base + '/login/';

const basePort = new URL(base).port || '80';
const allowedHosts = new Set([
  new URL(base).host,
  `localhost:${basePort}`,
  `127.0.0.1:${basePort}`,
]);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hostFor = url => { try { return new URL(url).host; } catch { return ''; } };

const browser = await puppeteer.connect({browserURL});
const page = await browser.newPage();
await page.setViewport({width: 1440, height: 900, deviceScaleFactor: 1});

const external = [];
const failed = [];
const localErrors = [];
const consoleErrors = [];

page.on('request', request => {
  const url = request.url();
  const host = hostFor(url);
  if (host && !allowedHosts.has(host) && !url.startsWith('data:') && !url.startsWith('blob:')) {
    external.push({method: request.method(), url});
  }
});
page.on('requestfailed', request => {
  const url = request.url();
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
  if (message.type() === 'error') {
    consoleErrors.push(message.text().slice(0, 300));
  }
});
page.on('pageerror', err => {
  consoleErrors.push('pageerror: ' + (err?.message || String(err)).slice(0, 300));
});

const flow = {};

try {
  await page.goto(target, {waitUntil: 'networkidle2', timeout: 60000});
} catch (e) {
  failed.push({url: target, failure: `goto: ${e.message}`});
}
await sleep(500);

// --- Drive the flow ---
// 1. Empty submit -> inline errors appear, no modal.
await page.click('.login-submit');
await sleep(300);
flow.emptyShowsErrors = await page.evaluate(() =>
  document.querySelectorAll('.login-field--invalid').length === 2 &&
  !document.querySelector('[data-login-overlay]').classList.contains('is-open')
);

// 2. Fill in email + password, submit -> success modal appears.
await page.type('#login-email', 'artist@247artists.com', {delay: 10});
await page.type('#login-password', 'supersecret', {delay: 10});
await page.click('.login-submit');
await sleep(400);
flow.modalAppears = await page.evaluate(() =>
  document.querySelector('[data-login-overlay]').classList.contains('is-open')
);

// 3. Dismiss via Continue button -> form resets to empty.
await page.click('[data-login-dismiss]');
await sleep(400);
const resetState = await page.evaluate(() => ({
  overlayOpen: document.querySelector('[data-login-overlay]').classList.contains('is-open'),
  email: document.querySelector('#login-email').value,
  password: document.querySelector('#login-password').value,
  invalidFields: document.querySelectorAll('.login-field--invalid').length,
}));
flow.modalDismissed = resetState.overlayOpen === false;
flow.formReset = resetState.email === '' && resetState.password === '' && resetState.invalidFields === 0;

// Re-open for the screenshot? No — screenshot the clean page.
await page.screenshot({path: screenshot, fullPage: true});

await page.close();
await browser.disconnect();

const flowPass = Object.values(flow).every(Boolean);
const ok =
  external.length === 0 &&
  failed.length === 0 &&
  localErrors.length === 0 &&
  consoleErrors.length === 0 &&
  flowPass;

const report = {
  ok,
  target,
  counts: {
    external: external.length,
    failed: failed.length,
    localErrors: localErrors.length,
    consoleErrors: consoleErrors.length,
  },
  flow,
  flowPass,
  external,
  failed,
  localErrors,
  consoleErrors,
};

await writeFile('login-verify-report.json', JSON.stringify(report, null, 2));
console.log('=== LOGIN VERIFY ===');
console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
