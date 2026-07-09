#!/usr/bin/env node
/**
 * backfill-pinterest-images.js
 *
 * Regenerates pinterest.jpg for every existing recipe using the new
 * bottom-card layout with hook copy, badge pills, and brand foot.
 *
 * Prerequisites: Python 3 + Pillow (pip install Pillow)
 *
 * Usage:
 *   node scripts/backfill-pinterest-images.js            # all recipes
 *   node scripts/backfill-pinterest-images.js --limit 10 # first 10 only
 *   node scripts/backfill-pinterest-images.js --force     # overwrite existing
 *   node scripts/backfill-pinterest-images.js --slug apple-walnut-salad
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Inline the overlay functions from generate-recipe.js so this script
// is self-contained and can run standalone.

// ── Copy of buildPinterestOverlayCopy (keep in sync with generate-recipe.js) ──
function buildPinterestOverlayCopy(recipe) {
  const rawTitle = String((recipe && recipe.title) || (recipe && recipe.targetKeyword) || 'Easy Weeknight Recipe');
  const totalMins = parseInt(String((recipe && recipe.totalTime) || '').replace(/\D/g, ''), 10);
  const servings = parseInt(String((recipe && recipe.servings) || '').replace(/\D/g, ''), 10);
  const ingredients = Array.isArray(recipe && recipe.ingredients) ? recipe.ingredients.length : 0;
  const category = String((recipe && recipe.category) || '').toLowerCase();
  const keyword = String((recipe && recipe.targetKeyword) || (recipe && recipe.keyword) || '').toLowerCase();
  const cuisine = String((recipe && recipe.cuisine) || '').trim();
  const instructions = Array.isArray(recipe && recipe.instructions) ? recipe.instructions.length : 0;

  const cleanTitle = rawTitle
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(easy|simple|homemade|authentic|best|perfect|classic|quick|budget)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const minsStr  = Number.isFinite(totalMins)    && totalMins    > 0 ? `${totalMins}`    : null;
  const ingStr   = ingredients >= 3 && ingredients <= 8 ? `${ingredients}` : null;
  const stepsStr = instructions >= 3 && instructions <= 7 ? `${instructions}` : null;

  const isHighProtein = /chicken|beef|turkey|pork|fish|shrimp|salmon|tuna|egg|bean|lentil/i.test(rawTitle + keyword);
  const isBudget = /budget|cheap|affordable|under \$|pantry|canned|frugal/i.test(keyword);
  const isOneP   = /one.pan|one.pot|sheet.pan|skillet|single.pan/i.test(keyword + rawTitle);
  const isQuick  = Number.isFinite(totalMins) && totalMins <= 25;

  const slugHash = rawTitle.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const variant  = Math.abs(slugHash) % 8;

  let headline;
  if (variant === 0 && minsStr) {
    headline = `${minsStr}-Minute ${cleanTitle}`;
  } else if (variant === 1 && ingStr) {
    headline = `${ingStr} Ingredients: ${cleanTitle}`;
  } else if (variant === 2 && isOneP) {
    headline = `One Pan ${cleanTitle} — Ready Fast`;
  } else if (variant === 3 && isHighProtein && minsStr) {
    headline = `High-Protein ${cleanTitle} in ${minsStr} Minutes`;
  } else if (variant === 4 && isBudget && minsStr) {
    headline = `${minsStr}-Minute ${cleanTitle} Under $10`;
  } else if (variant === 5 && stepsStr) {
    headline = `${stepsStr} Steps to the Best ${cleanTitle}`;
  } else if (variant === 6 && isQuick) {
    headline = `The ${cleanTitle} That Saves Weeknight Dinner`;
  } else {
    if (minsStr) {
      headline = `${cleanTitle} — Done in ${minsStr} Minutes`;
    } else if (ingStr) {
      headline = `${ingStr}-Ingredient ${cleanTitle}`;
    } else {
      headline = cleanTitle;
    }
  }

  if (headline.length > 54) {
    headline = minsStr ? `${minsStr}-Minute ${cleanTitle}` : cleanTitle;
  }
  if (headline.length > 54) headline = cleanTitle;

  const badges = [];
  if (Number.isFinite(totalMins) && totalMins > 0) badges.push(`${totalMins} MIN`);
  if (Number.isFinite(servings)  && servings  > 0) badges.push(`SERVES ${servings}`);

  if (isHighProtein) {
    badges.push('HIGH-PROTEIN');
  } else if (category === 'dessert') {
    badges.push('NO-BAKE DESSERT');
  } else if (isOneP) {
    badges.push('ONE PAN');
  } else if (isBudget) {
    badges.push('BUDGET MEAL');
  } else if (category === 'breakfast') {
    badges.push('BREAKFAST WIN');
  } else {
    badges.push('WEEKNIGHT EASY');
  }

  if (ingStr && badges.length < 4) badges.push(`${ingStr} INGREDIENTS`);

  const sub = cuisine && cuisine.toLowerCase() !== 'american'
    ? `${cuisine} · ImprovOven.com`
    : 'Budget Cooking · ImprovOven.com';

  return { headline, badges, subtitle: sub };
}

// Delegate to the canonical Python script (saliency-based smart crop)
const PYTHON_SCRIPT_PATH = path.join(__dirname, 'pinterest_image.py');

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10) || 0;
const FORCE = args.includes('--force');
const SINGLE_SLUG = args.find(a => a.startsWith('--slug='))?.split('=')[1] ?? null;

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  const dataPath = path.join(process.cwd(), 'recipes-data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('recipes-data.json not found — run from project root');
    process.exit(1);
  }

  const all = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  let recipes = Array.isArray(all) ? all : [];

  if (SINGLE_SLUG) {
    recipes = recipes.filter(r => r.slug === SINGLE_SLUG);
    if (!recipes.length) { console.error(`Slug not found: ${SINGLE_SLUG}`); process.exit(1); }
  }

  if (LIMIT > 0) recipes = recipes.slice(0, LIMIT);

  console.log(`🎨 Backfill Pinterest images — ${recipes.length} recipes (force=${FORCE})\n`);

  let ok = 0, skipped = 0, failed = 0;

  for (const recipe of recipes) {
    const slug = recipe.slug;
    if (!slug) { skipped++; continue; }

    const imagesDir = path.join(process.cwd(), 'recipes', slug, 'images');
    if (!fs.existsSync(imagesDir)) { skipped++; continue; }

    // Find hero image (prefer webp → jpg → png)
    let heroPath = null;
    for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
      const p = path.join(imagesDir, `hero.${ext}`);
      if (fs.existsSync(p)) { heroPath = p; break; }
    }
    if (!heroPath) {
      console.log(`  ⚠  ${slug}: no hero image, skipping`);
      skipped++;
      continue;
    }

    const outPath = path.join(imagesDir, 'pinterest.jpg');
    if (fs.existsSync(outPath) && !FORCE) {
      skipped++;
      continue;
    }

    const { headline, badges, subtitle } = buildPinterestOverlayCopy(recipe);
    const badgeStr = badges.join('|');

    process.stdout.write(`  → ${slug.slice(0, 55).padEnd(55)} `);

    const run = spawnSync(
      'python3',
      [PYTHON_SCRIPT_PATH, heroPath, headline, badgeStr, subtitle, outPath],
      { stdio: 'pipe' },
    );

    if (run.status === 0) {
      console.log('✓');
      ok++;
    } else {
      const errMsg = (run.stderr || Buffer.from('')).toString('utf8').slice(0, 120).trim();
      console.log(`✗  ${errMsg}`);
      failed++;
    }
  }

  console.log(`\nDone: ${ok} generated, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
