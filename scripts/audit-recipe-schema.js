#!/usr/bin/env node
/**
 * Scan each recipes/<slug>/index.html for Recipe JSON-LD and flag "polluted" fields
 * (navigation/skip-link text mistaken for ingredients or steps).
 *
 * Usage: node scripts/audit-recipe-schema.js
 * Exit 1 if any issue found (for CI).
 */

const fs = require('fs');
const path = require('path');

const RECIPES_DIR = path.join(__dirname, '..', 'recipes');

/** Hub / filter pages under recipes/ — not single-recipe pages, no Recipe JSON-LD expected */
const RECIPE_LISTING_SLUGS = new Set([
  'breakfast',
  'budget',
  'dessert',
  'dinner',
  'italian',
  'latin',
  'quick',
]);

function isRecipeListingPage(file) {
  const slug = path.basename(path.dirname(file));
  if (slug === 'recipes') return true; // recipes/index.html
  return RECIPE_LISTING_SLUGS.has(slug);
}

const INGREDIENT_DENY_PATTERNS = [
  /^skip to\b/i,
  /\bskip to\b/i,
  /^jump to\b/i,
  /primary navigation/i,
  /primary sidebar/i,
  /main content/i,
  /^menu$/i,
  /^search$/i,
  /^close$/i,
  /^cookie/i,
  /accept (all )?cookies/i,
  /^share$/i,
  /^print$/i,
  /^subscribe/i,
];

const STEP_DENY_PATTERNS = [
  /^skip to\b/i,
  /\bskip to\b/i,
];

function walkHtmlFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walkHtmlFiles(p, out);
    else if (name.isFile() && name.name === 'index.html') out.push(p);
  }
  return out;
}

function extractRecipeJsonLd(html) {
  const re = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    try {
      const data = JSON.parse(raw);
      if (data['@type'] === 'Recipe') return { data, rawLen: raw.length };
      if (Array.isArray(data['@graph'])) {
        const recipe = data['@graph'].find((n) => n && n['@type'] === 'Recipe');
        if (recipe) return { data: recipe, rawLen: raw.length };
      }
    } catch (_) {
      /* try next block */
    }
  }
  return null;
}

function flagStrings(list, patterns, label) {
  const hits = [];
  if (!Array.isArray(list)) return hits;
  for (let i = 0; i < list.length; i++) {
    const s = String(list[i] ?? '').trim();
    for (const pat of patterns) {
      if (pat.test(s)) {
        hits.push({ index: i, text: s, label });
        break;
      }
    }
  }
  return hits;
}

function flagSteps(steps) {
  const hits = [];
  if (!Array.isArray(steps)) return hits;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const text = typeof step === 'string' ? step : step && step.text;
    const s = String(text ?? '').trim();
    for (const pat of STEP_DENY_PATTERNS) {
      if (pat.test(s)) {
        hits.push({ index: i, text: s, label: 'recipeInstructions' });
        break;
      }
    }
  }
  return hits;
}

function main() {
  const files = walkHtmlFiles(RECIPES_DIR);
  const issues = [];

  for (const file of files) {
    if (isRecipeListingPage(file)) continue;

    const html = fs.readFileSync(file, 'utf8');
    const parsed = extractRecipeJsonLd(html);
    if (!parsed) {
      issues.push({ file, kind: 'missing', detail: 'No parseable Recipe JSON-LD' });
      continue;
    }
    const { data } = parsed;
    const ingHits = flagStrings(data.recipeIngredient, INGREDIENT_DENY_PATTERNS, 'recipeIngredient');
    const stepHits = flagSteps(data.recipeInstructions);
    const all = [...ingHits, ...stepHits];
    if (all.length) {
      issues.push({ file, kind: 'polluted', hits: all });
    }
  }

  if (issues.length === 0) {
    console.log(`OK: ${files.length} recipe pages — no pollution patterns matched.`);
    process.exit(0);
  }

  console.error(`Found ${issues.length} recipe page(s) with problems:\n`);
  for (const row of issues) {
    const rel = path.relative(path.join(__dirname, '..'), row.file);
    if (row.kind === 'missing') {
      console.error(`  ${rel}\n    — ${row.detail}\n`);
    } else {
      console.error(`  ${rel}`);
      for (const h of row.hits) {
        console.error(`    — ${h.label}[${h.index}]: ${JSON.stringify(h.text)}`);
      }
      console.error('');
    }
  }

  console.error(
    'Tip: fix source data or generation (scripts/generate-recipe.js), then rebuild pages.\n' +
      'For live URLs, spot-check with Google Rich Results Test after deploy.\n'
  );
  process.exit(1);
}

main();
