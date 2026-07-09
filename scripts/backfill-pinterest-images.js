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

  const minsStr  = Number.isFinite(totalMins) && totalMins > 0 ? `${totalMins}` : null;
  const ingStr   = ingredients >= 3 && ingredients <= 8 ? `${ingredients}` : null;

  const isHighProtein = /chicken|beef|turkey|pork|fish|shrimp|salmon|tuna|egg|bean|lentil/i.test(rawTitle + keyword);
  const isBudget = /budget|cheap|affordable|under \$|pantry|canned|frugal/i.test(keyword);
  const isOneP   = /one.pan|one.pot|sheet.pan|skillet|single.pan/i.test(keyword + rawTitle);
  const isQuick  = Number.isFinite(totalMins) && totalMins <= 25;

  const slugHash = rawTitle.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const themeIdx = Math.abs(slugHash) % 3;

  let headline;
  if (themeIdx === 0) {
    if (minsStr && isHighProtein) {
      headline = `${minsStr}-Minute ${cleanTitle} That Actually Delivers`;
    } else if (minsStr && isOneP) {
      headline = `One-Pan ${cleanTitle} Ready in ${minsStr} Minutes`;
    } else if (minsStr && cleanTitle.length <= 28) {
      headline = `${cleanTitle} — Done in ${minsStr} Minutes`;
    } else if (isHighProtein) {
      headline = `The High-Protein ${cleanTitle} Worth Bookmarking`;
    } else if (minsStr) {
      headline = `${cleanTitle} in ${minsStr} Minutes Flat`;
    } else if (ingStr) {
      headline = `The ${ingStr}-Ingredient ${cleanTitle} You'll Make on Repeat`;
    } else {
      headline = `The ${cleanTitle} Worth Making Tonight`;
    }
    if (headline.length > 58) headline = minsStr ? `${cleanTitle} — ${minsStr} Minutes` : cleanTitle;
  } else if (themeIdx === 1) {
    const up = cleanTitle.toUpperCase();
    if (minsStr && isHighProtein) {
      headline = `HIGH-PROTEIN ${up} IN ${minsStr} MIN`;
    } else if (minsStr && isOneP) {
      headline = `ONE PAN. ${minsStr} MINUTES. DONE.`;
    } else if (minsStr && isQuick) {
      headline = `${up} — ${minsStr} MIN`;
    } else if (ingStr && isHighProtein) {
      headline = `${ingStr}-INGREDIENT HIGH-PROTEIN ${up}`;
    } else if (minsStr) {
      headline = `${up} IN ${minsStr} MINUTES`;
    } else if (ingStr) {
      headline = `${ingStr} INGREDIENTS. ONE GREAT MEAL.`;
    } else {
      headline = `THE ONLY ${up} RECIPE YOU NEED`;
    }
    if (headline.length > 42) headline = minsStr ? `${up} — ${minsStr} MIN` : up;
    if (headline.length > 42) headline = up.slice(0, 38).trimEnd() + '...';
  } else {
    if (isQuick && minsStr) {
      headline = `Need Dinner in ${minsStr} Minutes? Try This ${cleanTitle}.`;
    } else if (isHighProtein && minsStr) {
      headline = `Why This ${minsStr}-Min ${cleanTitle} Is on Constant Repeat`;
    } else if (ingStr && parseInt(ingStr) <= 6) {
      headline = `The ${ingStr}-Ingredient ${cleanTitle} Everyone's Saving`;
    } else if (isOneP) {
      headline = `One Pan, Zero Stress: ${cleanTitle}`;
    } else if (minsStr) {
      const mealWord = /cookie|cake|brownie|dessert|pie|muffin|waffle|pancake|drink|cocktail|smoothie/i.test(rawTitle + keyword)
        ? 'Recipe'
        : 'Dinner';
      headline = `${cleanTitle} — ${mealWord} Done in ${minsStr} Minutes`;
    } else {
      headline = `Why Everyone's Making This ${cleanTitle} Right Now`;
    }
    if (headline.length > 62) headline = minsStr ? `${cleanTitle} in ${minsStr} Minutes` : cleanTitle;
  }
  if (headline.length > 62) headline = cleanTitle;

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

  if (ingStr && badges.length < 4) badges.push(`${ingStr} INGR`);

  const sub = cuisine && cuisine.toLowerCase() !== 'american'
    ? `${cuisine} · ImprovOven.com`
    : 'Budget Cooking · ImprovOven.com';

  return { headline, badges, subtitle: sub, themeIdx };
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

    const { headline, badges, subtitle, themeIdx } = buildPinterestOverlayCopy(recipe);
    const badgeStr = badges.join('|');

    process.stdout.write(`  → ${slug.slice(0, 55).padEnd(55)} `);

    const run = spawnSync(
      'python3',
      [PYTHON_SCRIPT_PATH, heroPath, headline, badgeStr, subtitle, outPath, String(themeIdx)],
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
