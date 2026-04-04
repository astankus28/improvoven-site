#!/usr/bin/env node
'use strict';

/**
 * Fixes recipe (and recipes index) HTML:
 * - JSON-LD step URLs with literal ${slug}
 * - Absolute og:image
 * - og:url and Twitter meta when missing
 * - GA4 from site-config when missing
 * - id="step-N" on instruction <li> when missing
 */

const fs = require('fs');
const path = require('path');
const { SITE_URL, GA_MEASUREMENT_ID, GTAG_SNIPPET } = require('./site-config');

const HTML_ROOTS = [
  path.join(process.cwd(), 'recipes'),
  path.join(process.cwd(), 'roundups'),
];

function walkHtmlFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkHtmlFiles(full, out);
    else if (name === 'index.html') out.push(full);
  }
  return out;
}

function extractCanonical(html) {
  const m = html.match(/<link\s+rel="canonical"\s+href="(https:\/\/www\.improvoven\.com[^"]*)"/i);
  return m ? m[1].replace(/\/+$/, '') + '/' : null;
}

function extractMetaProperty(html, prop) {
  const m = html.match(new RegExp(`<meta\\s+property="${prop}"\\s+content="([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function extractMetaName(html, name) {
  const m = html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function extractTitleTag(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim() : '';
}

function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function fixHtml(html) {
  let out = html;
  const canonical = extractCanonical(out);
  if (!canonical) {
    return { out, changed: false, skip: 'no canonical' };
  }

  const slugMatch = canonical.match(/\/recipes\/([^/]+)\/$/);
  const slug = slugMatch ? slugMatch[1] : null;

  let changed = false;

  if (slug && out.includes('${slug}')) {
    const re = /https:\/\/www\.improvoven\.com\/recipes\/\$\{slug\}\//g;
    const next = out.replace(re, `https://www.improvoven.com/recipes/${slug}/`);
    if (next !== out) {
      out = next;
      changed = true;
    }
  }

  const ogImgFixed = out.replace(
    /<meta\s+property="og:image"\s+content="(\/(?!\/)[^"]+)"/gi,
    (_, p) => {
      changed = true;
      return `<meta property="og:image" content="${SITE_URL}${p}"`;
    }
  );
  out = ogImgFixed;

  if (!/property="og:url"/i.test(out)) {
    const ogType = out.match(/<meta\s+property="og:type"[^>]*>/i);
    const linkCan = out.match(/<link\s+rel="canonical"[^>]*>/i);
    if (ogType) {
      out = out.replace(ogType[0], `${ogType[0]}\n<meta property="og:url" content="${canonical}">`);
      changed = true;
    } else if (linkCan) {
      out = out.replace(linkCan[0], `<meta property="og:url" content="${canonical}">\n${linkCan[0]}`);
      changed = true;
    }
  }

  if (!/name="twitter:card"/i.test(out)) {
    const twTitle =
      extractMetaProperty(out, 'og:title') || extractTitleTag(out) || 'Improv Oven';
    const twDesc =
      extractMetaProperty(out, 'og:description') ||
      extractMetaName(out, 'description') ||
      '';
    const twImage =
      extractMetaProperty(out, 'og:image') || `${SITE_URL}/og-image.jpg`;

    const block = `
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(twTitle)}">
<meta name="twitter:description" content="${escAttr(twDesc)}">
<meta name="twitter:image" content="${escAttr(twImage)}">`;

    const anchor =
      out.match(/<meta\s+property="og:image"[^>]*>/i) ||
      out.match(/<meta\s+property="og:url"[^>]*>/i) ||
      out.match(/<link\s+rel="canonical"[^>]*>/i);
    if (anchor) {
      out = out.replace(anchor[0], `${anchor[0]}${block}`);
      changed = true;
    }
  }

  if (!out.includes(GA_MEASUREMENT_ID)) {
    out = out.replace(/<head>/i, `<head>\n${GTAG_SNIPPET}`);
    changed = true;
  }

  let step = 0;
  out = out.replace(
    /<li([^>]*\bitemprop="recipeInstructions"[^>]*)>/gi,
    (full, attrs) => {
      if (/\bid="step-\d+"/i.test(attrs)) return full;
      step += 1;
      changed = true;
      return `<li id="step-${step}"${attrs}>`;
    }
  );

  return { out, changed, skip: null };
}

function main() {
  const files = HTML_ROOTS.flatMap((root) => walkHtmlFiles(root));
  let n = 0;
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const { out, changed, skip } = fixHtml(raw);
    if (skip) {
      console.log(`skip ${path.relative(process.cwd(), file)}: ${skip}`);
      continue;
    }
    if (changed) {
      fs.writeFileSync(file, out, 'utf8');
      n++;
      console.log(`✓ ${path.relative(process.cwd(), file)}`);
    }
  }
  console.log(`\nUpdated ${n} file(s).`);
}

main();
