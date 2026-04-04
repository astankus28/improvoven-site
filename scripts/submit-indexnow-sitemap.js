#!/usr/bin/env node
'use strict';

/**
 * Submits every <loc> from sitemap.xml to IndexNow (up to 10,000 URLs per request).
 */

const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config();
} catch (_) {}

const { submitIndexNowUrls } = require('./submit-indexnow.js');

const MAX_URLS = 10000;

async function main() {
  const smPath = path.join(process.cwd(), 'sitemap.xml');
  if (!fs.existsSync(smPath)) {
    console.error('sitemap.xml not found. Run npm run rebuild:index first.');
    process.exit(1);
  }
  const xml = fs.readFileSync(smPath, 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim()).filter(Boolean);
  if (!urls.length) {
    console.error('No <loc> entries in sitemap.xml');
    process.exit(1);
  }
  for (let i = 0; i < urls.length; i += MAX_URLS) {
    const chunk = urls.slice(i, i + MAX_URLS);
    await submitIndexNowUrls(chunk);
    console.log(`✓ IndexNow OK — URLs ${i + 1}–${i + chunk.length} (${chunk.length} in batch)`);
  }
}

main().catch((e) => {
  console.error('IndexNow sitemap failed:', e.message);
  process.exit(1);
});
