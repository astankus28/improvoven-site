#!/usr/bin/env node
'use strict';

/**
 * Submits URLs to IndexNow (Bing, Yandex, etc.).
 * Setup:
 * 1. In Bing Webmaster Tools → IndexNow, generate a key.
 * 2. Host https://www.improvoven.com/{your-key}.txt with the key as the file body (plain text).
 * 3. Set INDEXNOW_KEY in the environment (or .env for local runs).
 *
 * Usage:
 *   node scripts/submit-indexnow.js https://www.improvoven.com/recipes/foo/
 *   node scripts/submit-indexnow.js --file urls.txt
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config();
} catch (_) {}

const { SITE_URL } = require('./site-config');

const HOST = (() => {
  try {
    return new URL(SITE_URL).hostname;
  } catch {
    return 'www.improvoven.com';
  }
})();

function postIndexNow(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: 'api.indexnow.org',
        path: '/IndexNow',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(data, 'utf8'),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: buf });
          } else {
            reject(new Error(`IndexNow HTTP ${res.statusCode}: ${buf || res.statusMessage}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function submitIndexNowUrls(urlList) {
  const key = process.env.INDEXNOW_KEY;
  if (!key || key.trim().length < 8) {
    throw new Error('INDEXNOW_KEY missing or too short (set in env; host {key}.txt at site root)');
  }
  const trimmed = key.trim();
  const keyLocation =
    process.env.INDEXNOW_KEY_LOCATION || `${SITE_URL.replace(/\/$/, '')}/${trimmed}.txt`;
  const body = {
    host: HOST,
    key: trimmed,
    keyLocation,
    urlList,
  };
  return postIndexNow(body);
}

async function main() {
  const urls = [];
  const args = process.argv.slice(2);
  if (args[0] === '--file' && args[1]) {
    const p = path.resolve(args[1]);
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const u = line.trim();
      if (u && !u.startsWith('#')) urls.push(u);
    }
  } else {
    for (const a of args) {
      if (a.startsWith('-')) continue;
      urls.push(a.trim());
    }
  }

  if (urls.length === 0) {
    console.error('Pass one or more full URLs, or: --file urls.txt');
    console.error('Set INDEXNOW_KEY in the environment.');
    process.exit(1);
  }

  await submitIndexNowUrls(urls);
  console.log(`✓ IndexNow OK (${urls.length} URL(s))`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('IndexNow failed:', e.message);
    process.exit(1);
  });
}

module.exports = { submitIndexNowUrls, postIndexNow };
