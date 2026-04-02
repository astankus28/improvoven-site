#!/usr/bin/env node

/**
 * upgrade-legacy-recipes.js
 * 
 * Run from the root of your improvoven-site repo:
 *   node upgrade-legacy-recipes.js
 * 
 * What it does:
 *   1. Scans every folder in /recipes/
 *   2. Audits each page — checks for real ingredients + instructions vs placeholder
 *   3. Rewrites title, meta description, intro, and tip box via Claude API
 *   4. Saves updated files in place
 *   5. Outputs a full audit report at the end
 * 
 * Requires: ANTHROPIC_API_KEY in your environment (same one used by generate-recipe.js)
 */

const fs = require('fs');
const path = require('path');

const RECIPES_DIR = path.join(process.cwd(), 'recipes');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// These are the "new" automated recipes — skip them, they're already good
const SKIP_PATTERNS = [
  /\d{4}-\d{2}-\d{2}$/,        // date-stamped new recipes like slug-2026-03-25
  /^breakfast$/, /^dinner$/, /^lunch$/, /^dessert$/,  // category folders
  /^budget$/, /^quick$/, /^latin$/, /^italian$/,       // category folders
];

// The dead giveaway of a placeholder legacy page
const PLACEHOLDER_DESC = 'A delicious and easy recipe that comes together quickly with simple ingredients.';
const PLACEHOLDER_TIP = 'Feel free to improvise — swap ingredients based on what you have. That\'s what Improv Oven is all about.';

const results = {
  upgraded: [],
  skipped_new: [],
  skipped_no_html: [],
  needs_manual: [],    // has placeholder AND no real ingredients found
  already_good: [],    // legacy page that someone already fixed
};

function shouldSkip(folderName) {
  return SKIP_PATTERNS.some(p => p.test(folderName));
}

function extractContent(html) {
  // Pull the current title
  const titleMatch = html.match(/<title>(.*?)<\/title>/s);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Pull current meta description
  const descMatch = html.match(/<meta name="description" content="(.*?)"/s);
  const metaDesc = descMatch ? descMatch[1].trim() : '';

  // Pull the recipe-desc paragraph (the italic intro)
  const introMatch = html.match(/<p class="recipe-desc">(.*?)<\/p>/s);
  const intro = introMatch ? introMatch[1].trim() : '';

  // Pull the tip box content
  const tipMatch = html.match(/<div class="tip-box">.*?<p>(.*?)<\/p>/s);
  const tip = tipMatch ? tipMatch[1].trim() : '';

  // Pull the recipe name from schema
  const nameMatch = html.match(/"name":"(.*?)"/);
  const recipeName = nameMatch ? nameMatch[1].trim() : title.replace(' - Improv Oven', '');

  // Extract ingredients from schema JSON-LD (most reliable source)
  const ingredientsMatch = html.match(/"recipeIngredient":\[(.*?)\]/s);
  const ingredients = ingredientsMatch ? ingredientsMatch[1] : '';

  // Extract instructions from schema
  const instructionsMatch = html.match(/"recipeInstructions":\[(.*?)\]/s);
  const instructions = instructionsMatch ? instructionsMatch[1] : '';

  // Extract stats
  const prepMatch = html.match(/class="stat-label">Prep<\/div><div class="stat-val">(.*?)<\/div>/);
  const cookMatch = html.match(/class="stat-label">Cook<\/div><div class="stat-val">(.*?)<\/div>/);
  const servesMatch = html.match(/class="stat-label">Serves<\/div><div class="stat-val">(.*?)<\/div>/);

  return {
    title,
    metaDesc,
    intro,
    tip,
    recipeName,
    ingredients,
    instructions,
    prep: prepMatch ? prepMatch[1] : '',
    cook: cookMatch ? cookMatch[1] : '',
    serves: servesMatch ? servesMatch[1] : '',
    hasRealContent: ingredients.length > 50 && instructions.length > 50,
    isPlaceholder: metaDesc === PLACEHOLDER_DESC || intro.includes('Feel free to improvise') || tip === PLACEHOLDER_TIP,
  };
}

function replaceInHtml(html, field, newValue) {
  const replacements = {
    title: [/<title>.*?<\/title>/s, `<title>${newValue}</title>`],
    metaDesc: [/<meta name="description" content=".*?"/s, `<meta name="description" content="${newValue}"`],
    ogTitle: [/<meta property="og:title" content=".*?"/s, `<meta property="og:title" content="${newValue}"`],
    ogDesc: [/<meta property="og:description" content=".*?"/s, `<meta property="og:description" content="${newValue}"`],
    intro: [/<p class="recipe-desc">.*?<\/p>/s, `<p class="recipe-desc">${newValue}</p>`],
    tip: [/(<div class="tip-box">[\s\S]*?<div class="tip-label">.*?<\/div>\s*<p>).*?(<\/p>)/s, `$1${newValue}$2`],
  };

  const [pattern, replacement] = replacements[field];
  return html.replace(pattern, replacement);
}

async function rewriteSEO(slug, content) {
  const prompt = `You are writing SEO copy for Improv Oven, a food blog focused on simple budget-friendly recipes with Miami and Latin American influence.

Recipe: ${content.recipeName}
Current meta description: ${content.metaDesc}
Prep time: ${content.prep}, Cook time: ${content.cook}, Serves: ${content.serves}
Ingredients (from schema): ${content.ingredients.substring(0, 500)}
Instructions (from schema): ${content.instructions.substring(0, 500)}

Write the following. Return ONLY valid JSON, no markdown, no explanation:
{
  "title": "SEO page title under 60 chars. Format: [Recipe Name] - [key benefit] | Improv Oven. Example: 'Easy Shepherd's Pie - One Pan, Done in an Hour | Improv Oven'",
  "metaDesc": "Meta description 140-155 chars. Mention key ingredients, time, or unique angle. No generic phrases like 'delicious and easy'.",
  "ogTitle": "Same as title but can be slightly more casual",
  "ogDesc": "Short punchy version of metaDesc, under 100 chars",
  "intro": "2-3 sentence intro paragraph in Improv Oven voice — conversational, real, specific to THIS recipe. No generic food blog fluff. Mention something specific about the dish. Under 80 words.",
  "tip": "1-2 sentence practical cooking tip specific to this recipe. Something genuinely useful that most recipes don't mention. Under 60 words."
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error(`  ⚠ JSON parse failed for ${slug}:`, text.substring(0, 100));
    return null;
  }
}

async function processRecipe(folderName) {
  const htmlPath = path.join(RECIPES_DIR, folderName, 'index.html');

  if (!fs.existsSync(htmlPath)) {
    results.skipped_no_html.push(folderName);
    return;
  }

  let html = fs.readFileSync(htmlPath, 'utf8');
  const content = extractContent(html);

  // Skip if no real recipe content found
  if (!content.hasRealContent) {
    results.needs_manual.push({
      slug: folderName,
      reason: 'No ingredients/instructions found in schema — may be a placeholder or malformed page',
      title: content.title,
    });
    return;
  }

  // Skip if already has good SEO (not a placeholder)
  if (!content.isPlaceholder) {
    results.already_good.push(folderName);
    return;
  }

  console.log(`  ✍  Rewriting: ${folderName}`);

  const seo = await rewriteSEO(folderName, content);

  if (!seo) {
    results.needs_manual.push({
      slug: folderName,
      reason: 'Claude API returned invalid JSON',
      title: content.title,
    });
    return;
  }

  // Apply all rewrites
  html = replaceInHtml(html, 'title', seo.title);
  html = replaceInHtml(html, 'metaDesc', seo.metaDesc);
  html = replaceInHtml(html, 'ogTitle', seo.ogTitle);
  html = replaceInHtml(html, 'ogDesc', seo.ogDesc);
  html = replaceInHtml(html, 'intro', seo.intro);
  html = replaceInHtml(html, 'tip', seo.tip);

  fs.writeFileSync(htmlPath, html, 'utf8');
  results.upgraded.push({ slug: folderName, newTitle: seo.title });
}

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set. Run: export ANTHROPIC_API_KEY=your_key_here');
    process.exit(1);
  }

  if (!fs.existsSync(RECIPES_DIR)) {
    console.error('❌ /recipes/ directory not found. Run this from the root of your improvoven-site repo.');
    process.exit(1);
  }

  const folders = fs.readdirSync(RECIPES_DIR).filter(f => {
    const fullPath = path.join(RECIPES_DIR, f);
    return fs.statSync(fullPath).isDirectory();
  });

  const legacyFolders = folders.filter(f => !shouldSkip(f));

  console.log(`\n🔍 Found ${folders.length} total recipe folders`);
  console.log(`📋 ${legacyFolders.length} legacy folders to check (skipping ${folders.length - legacyFolders.length} new/category folders)\n`);

  // Process with a small delay between API calls to be safe
  for (const folder of legacyFolders) {
    process.stdout.write(`Checking: ${folder}... `);
    await processRecipe(folder);

    // Small delay to avoid hammering the API
    await new Promise(r => setTimeout(r, 500));
  }

  // Print audit report
  console.log('\n' + '='.repeat(60));
  console.log('AUDIT REPORT');
  console.log('='.repeat(60));

  console.log(`\n✅ UPGRADED (${results.upgraded.length} pages):`);
  results.upgraded.forEach(r => console.log(`   ${r.slug}\n     → ${r.newTitle}`));

  console.log(`\n⭐ ALREADY GOOD - skipped (${results.already_good.length} pages):`);
  results.already_good.forEach(r => console.log(`   ${r}`));

  console.log(`\n⚠️  NEEDS MANUAL REVIEW (${results.needs_manual.length} pages):`);
  results.needs_manual.forEach(r => console.log(`   ${r.slug}\n     Reason: ${r.reason}`));

  console.log(`\n📁 SKIPPED - no index.html (${results.skipped_no_html.length} folders):`);
  results.skipped_no_html.forEach(r => console.log(`   ${r}`));

  console.log(`\n📊 SUMMARY:`);
  console.log(`   Upgraded:        ${results.upgraded.length}`);
  console.log(`   Already good:    ${results.already_good.length}`);
  console.log(`   Needs manual:    ${results.needs_manual.length}`);
  console.log(`   No HTML found:   ${results.skipped_no_html.length}`);
  console.log(`   Total checked:   ${legacyFolders.length}`);

  // Save report to file
  const report = {
    date: new Date().toISOString(),
    summary: {
      upgraded: results.upgraded.length,
      already_good: results.already_good.length,
      needs_manual: results.needs_manual.length,
      no_html: results.skipped_no_html.length,
    },
    upgraded: results.upgraded,
    already_good: results.already_good,
    needs_manual: results.needs_manual,
    no_html: results.skipped_no_html,
  };

  fs.writeFileSync(
    path.join(process.cwd(), 'audit-report.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log('\n📄 Full report saved to audit-report.json');
  console.log('\nDone! Commit and push to deploy.\n');
}

main().catch(console.error);
