#!/usr/bin/env node

const path = require('path');
const { postToPinterest } = require('./pinterest-post.js');

function parseArgs(argv) {
  const args = {
    last: null,
    since: null,
    dryRun: false,
    delayMs: parseInt(process.env.PINTEREST_BACKFILL_DELAY_MS || '20000', 10),
    slugs: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--last') {
      args.last = parseInt(argv[++i] || '', 10);
    } else if (token === '--since') {
      args.since = argv[++i] || null;
    } else if (token === '--delay-ms') {
      args.delayMs = parseInt(argv[++i] || '', 10);
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--slug') {
      const slug = argv[++i];
      if (slug) args.slugs.push(slug);
    } else if (token === '--help' || token === '-h') {
      printHelpAndExit(0);
    } else {
      console.error(`Unknown argument: ${token}`);
      printHelpAndExit(1);
    }
  }

  if (args.last !== null && (!Number.isInteger(args.last) || args.last <= 0)) {
    throw new Error('--last must be a positive integer');
  }
  if (!Number.isInteger(args.delayMs) || args.delayMs < 0) {
    throw new Error('--delay-ms must be a non-negative integer');
  }
  if (args.since) {
    args.since = normalizeSince(args.since);
  }
  if (args.since && !/^\d{4}-\d{2}-\d{2}$/.test(args.since)) {
    throw new Error('--since must be in YYYY-MM-DD format');
  }

  return args;
}

function normalizeSince(raw) {
  let value = String(raw || '').trim();
  value = value.replace(/^since\s*=\s*/i, '');
  value = value.replace(/[,\s]+$/g, '');
  return value;
}

function printHelpAndExit(code) {
  console.log(`
Usage:
  node scripts/backfill-pinterest.js [options]

Options:
  --last <n>         Post last N recipes from recipes-data.json
  --since <date>     Post recipes on/after YYYY-MM-DD
  --slug <slug>      Post a specific slug (repeatable)
  --delay-ms <ms>    Delay between posts (default: env PINTEREST_BACKFILL_DELAY_MS or 20000)
  --dry-run          Show which recipes would post, without calling Pinterest
  --help, -h         Show this help

Examples:
  node scripts/backfill-pinterest.js --last 12
  node scripts/backfill-pinterest.js --since 2026-04-20
  node scripts/backfill-pinterest.js --slug my-recipe-slug-2026-04-30 --slug another-recipe
  node scripts/backfill-pinterest.js --since 2026-04-20 --dry-run
`);
  process.exit(code);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function selectRecipes(allRecipes, args) {
  if (args.slugs.length > 0) {
    const bySlug = new Map(allRecipes.map(r => [r.slug, r]));
    const selected = [];
    for (const slug of args.slugs) {
      if (!bySlug.has(slug)) {
        console.warn(`⚠ Skipping unknown slug: ${slug}`);
        continue;
      }
      selected.push(bySlug.get(slug));
    }
    return selected;
  }

  let selected = [...allRecipes];
  if (args.since) {
    selected = selected.filter(r => String(r.date || '') >= args.since);
  }

  // recipes-data is newest-first. Reverse to post oldest-first for gentler cadence.
  selected = selected.reverse();

  if (args.last !== null) {
    selected = selected.slice(-args.last);
  }

  return selected;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const recipes = require(path.join(process.cwd(), 'recipes-data.json'));
  const toPost = selectRecipes(recipes, args);

  if (toPost.length === 0) {
    console.log('No matching recipes found for backfill.');
    return;
  }

  console.log(`Found ${toPost.length} recipe(s) to process.`);
  for (const recipe of toPost) {
    console.log(` - ${recipe.slug} (${recipe.date})`);
  }

  if (args.dryRun) {
    console.log('\nDry run complete. No Pinterest API calls were made.');
    return;
  }

  if (!process.env.PINTEREST_ACCESS_TOKEN) {
    throw new Error('PINTEREST_ACCESS_TOKEN is required for backfill posting');
  }

  const failures = [];
  for (let i = 0; i < toPost.length; i++) {
    const recipe = toPost[i];
    console.log(`\n[${i + 1}/${toPost.length}] Posting ${recipe.slug}`);
    try {
      await postToPinterest(recipe, recipe.slug);
      console.log(`✅ Posted ${recipe.slug}`);
    } catch (error) {
      const message = (error && error.message) ? error.message : String(error);
      console.error(`❌ Failed ${recipe.slug}: ${message}`);
      failures.push({ slug: recipe.slug, message });
    }

    if (i < toPost.length - 1 && args.delayMs > 0) {
      console.log(`⏳ Waiting ${Math.round(args.delayMs / 1000)}s before next post...`);
      await sleep(args.delayMs);
    }
  }

  if (failures.length > 0) {
    console.error('\nBackfill completed with failures:');
    for (const f of failures) {
      console.error(` - ${f.slug}: ${f.message}`);
    }
    process.exit(1);
  }

  console.log('\n✅ Backfill completed successfully.');
}

main().catch(err => {
  console.error(`\n❌ Backfill error: ${err.message}`);
  process.exit(1);
});
