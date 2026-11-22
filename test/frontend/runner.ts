/* eslint-disable no-console */
// Builds the frontend in development mode, serves it with the API, and runs
// the mocha tests of test/frontend/tests in a headless Chrome.
import fs from 'fs';
import type { AddressInfo } from 'net';
import express from 'express';
import puppeteer, { type Browser } from 'puppeteer-core';
import webpack from 'webpack';
import middleware from 'webpack-dev-middleware';
import testServer from '../../server/bin/test';

// webpack.config.js is plain CommonJS, shared with the webpack CLI
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../webpack.config');

interface MochaResults {
  stats: { passes: number; failures: number; duration: number };
  failures: { fullTitle: string; err: { stack?: string; message?: string } }[];
}

declare const runner: { testResults?: MochaResults };

const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
];

function chromePath(): string {
  const found = CHROME_PATHS.find(p => p && fs.existsSync(p));
  if (!found) {
    throw new Error(
      'Chrome not found, set PUPPETEER_EXECUTABLE_PATH to a Chrome or Chromium binary'
    );
  }
  return found;
}

const compiler = webpack(config(null, { mode: 'development' }));
const wpm = middleware(compiler, { logLevel: 'silent' });
const app = express();
app.use(wpm);
testServer(app, { middleware: wpm as never });

const server = app.listen(0, '127.0.0.1', async function () {
  let exitCode = 1;
  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath(),
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    page.on('pageerror', err => console.log(err));
    page.setDefaultNavigationTimeout(120000);
    const { port } = server.address() as AddressInfo;
    await page.goto(`http://127.0.0.1:${port}/test`);
    await page.waitForFunction(
      () => typeof runner.testResults !== 'undefined',
      { polling: 1000, timeout: 120000 }
    );
    const results = (await page.evaluate(
      () => runner.testResults
    )) as MochaResults;
    const stats = results.stats;
    exitCode = stats.failures;
    console.log(`${stats.passes} passing (${stats.duration}ms)\n`);
    if (stats.failures) {
      console.log('Failures:\n');
      for (const f of results.failures) {
        console.log(`${f.fullTitle}`);
        console.log(` ${f.err.stack || f.err.message}\n`);
      }
    }
  } catch (e) {
    console.log(e);
  } finally {
    if (browser) await browser.close();
    wpm.close();
    server.close(() => {
      process.exit(exitCode);
    });
  }
});
