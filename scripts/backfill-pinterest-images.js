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

// ── Copy of buildPinterestOverlayCopy ────────────────────────────────────
function buildPinterestOverlayCopy(recipe) {
  const rawTitle = String((recipe && recipe.title) || (recipe && recipe.targetKeyword) || 'Easy Weeknight Recipe');
  const totalMins = parseInt(String((recipe && recipe.totalTime) || '').replace(/\D/g, ''), 10);
  const servings = parseInt(String((recipe && recipe.servings) || '').replace(/\D/g, ''), 10);
  const ingredients = Array.isArray(recipe && recipe.ingredients) ? recipe.ingredients.length : 0;
  const category = String((recipe && recipe.category) || '').toLowerCase();
  const keyword = String((recipe && recipe.targetKeyword) || '').toLowerCase();

  const cleanTitle = rawTitle
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(easy|simple|homemade|authentic|best|perfect|recipe)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const minsStr = Number.isFinite(totalMins) && totalMins > 0 ? `${totalMins}` : null;
  const ingStr = ingredients >= 3 && ingredients <= 7 ? `${ingredients}` : null;

  const slugHash = rawTitle.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const hookVariant = Math.abs(slugHash) % 6;

  let headline;
  if (hookVariant === 0 && minsStr) {
    headline = `Ready in ${minsStr} Minutes — ${cleanTitle}`;
  } else if (hookVariant === 1 && ingStr) {
    headline = `Only ${ingStr} Ingredients: ${cleanTitle}`;
  } else if (hookVariant === 2) {
    headline = `The Budget ${cleanTitle} You'll Make Every Week`;
  } else if (hookVariant === 3 && minsStr && parseInt(minsStr) <= 25) {
    headline = `${minsStr}-Minute ${cleanTitle} That Tastes Like a Restaurant`;
  } else if (hookVariant === 4) {
    headline = `This ${cleanTitle} Costs Almost Nothing`;
  } else {
    headline = `You Need This ${cleanTitle} in Your Life`;
  }
  if (headline.length > 58) headline = cleanTitle;

  const badges = [];
  if (Number.isFinite(totalMins) && totalMins > 0) badges.push(`${totalMins} MIN`);
  if (Number.isFinite(servings) && servings > 0) badges.push(`SERVES ${servings}`);
  if (ingredients > 0) badges.push(`${ingredients} INGREDIENTS`);
  if (keyword.includes('budget') || keyword.includes('cheap') || keyword.includes('affordable')) {
    badges.push('BUDGET-FRIENDLY');
  } else if (category === 'dessert') {
    badges.push('NO FUSS DESSERT');
  } else {
    badges.push('EASY WEEKNIGHT');
  }

  const cuisine = String((recipe && recipe.cuisine) || '').trim();
  const subtitle = cuisine && cuisine.toLowerCase() !== 'american'
    ? `${cuisine} · Improv Oven`
    : 'Budget Cooking · Improv Oven';

  return { headline, badges, subtitle };
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
