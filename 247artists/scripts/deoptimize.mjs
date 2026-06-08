#!/usr/bin/env node
// Generate the served, human-readable site/ from the raw minified archive in
// legacy/. Minified theme JS/CSS (and the inline scripts inside each HTML page)
// are pretty-printed with Prettier; SVG/XML/fonts/images are copied
// byte-for-byte. The legacy/ archive is never modified.
//
// Prettier reparses each file to an AST and reprints it, so formatting is
// semantics-preserving — but we still verify site/ end-to-end with Puppeteer
// (`npm run verify:puppeteer`). Any file Prettier cannot parse is copied
// through unchanged and recorded in the report.

import {copyFile, mkdir, readdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, extname, join, relative, resolve, sep} from 'node:path';
import * as prettier from 'prettier';

const INPUT_DIR = resolve('legacy');
const OUTPUT_DIR = resolve('site');
const REPORT_PATH = resolve('DEOPTIMIZE_REPORT.json');

const parserByExtension = new Map([
  ['.html', 'html'],
  ['.css', 'css'],
  ['.js', 'babel'],
  ['.mjs', 'babel'],
  ['.json', 'json'],
  ['.webmanifest', 'json'],
]);

const textExtensions = new Set(parserByExtension.keys());

async function walk(dir) {
  const entries = await readdir(dir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function slashPath(pathname) {
  return pathname.split(sep).join('/');
}

async function formatText(source, parser, file) {
  const options = {
    parser,
    printWidth: 100,
    tabWidth: 2,
    singleQuote: false,
    bracketSameLine: false,
    htmlWhitespaceSensitivity: 'ignore',
  };
  try {
    return {text: await prettier.format(source, options), formatted: true, error: null};
  } catch (error) {
    return {text: source, formatted: false, error: `${file}: ${error.message}`};
  }
}

async function main() {
  await stat(INPUT_DIR);
  await rm(OUTPUT_DIR, {recursive: true, force: true});
  await mkdir(OUTPUT_DIR, {recursive: true});

  const report = {
    inputDir: INPUT_DIR,
    outputDir: OUTPUT_DIR,
    filesCopied: 0,
    textFormatted: 0,
    textUnformatted: 0,
    binaryCopied: 0,
    errors: [],
  };

  const files = await walk(INPUT_DIR);
  for (const sourceFile of files) {
    const rel = slashPath(relative(INPUT_DIR, sourceFile));
    const targetFile = join(OUTPUT_DIR, rel);
    const ext = extname(sourceFile).toLowerCase();
    await mkdir(dirname(targetFile), {recursive: true});

    if (!textExtensions.has(ext)) {
      await copyFile(sourceFile, targetFile);
      report.binaryCopied++;
      report.filesCopied++;
      continue;
    }

    const source = await readFile(sourceFile, 'utf8');
    const result = await formatText(source, parserByExtension.get(ext), rel);
    await writeFile(targetFile, result.text);
    if (result.formatted) {
      report.textFormatted++;
    } else {
      report.textUnformatted++;
      report.errors.push(result.error);
    }
    report.filesCopied++;
  }

  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    filesCopied: report.filesCopied,
    textFormatted: report.textFormatted,
    textUnformatted: report.textUnformatted,
    binaryCopied: report.binaryCopied,
    errors: report.errors.length,
  }, null, 2));
  if (report.errors.length) {
    console.log('\nUnformatted (copied as-is):');
    for (const e of report.errors.slice(0, 30)) console.log('-', e);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
