require('dotenv').config();

/**
 * upgrade-legacy-recipes-v2.js
 * 
 * Run from the root of your improvoven-site repo:
 *   node upgrade-legacy-recipes-v2.js
 * 
 * Fixes from v1:
 *   - Better JSON extraction (handles markdown backticks, extracts from any valid JSON block)
 *   - Retry logic (3 attempts per recipe with backoff)
 *   - Resume support (saves progress to checkpoint.json, skips already-done recipes)
 *   - Longer delay between calls to avoid connection drops
 */

const fs = require('fs');
const path = require('path');

const RECIPES_DIR = path.join(process.cwd(), 'recipes');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CHECKPOINT_FILE = path.join(process.cwd(), 'upgrade-checkpoint.json');
const REPORT_FILE = path.join(process.cwd(), 'audit-report.json');

const SKIP_PATTERNS = [
  /\d{4}-\d{2}-\d{2}/,
  /^breakfast$/, /^dinner$/, /^lunch$/, /^dessert$/,
  /^budget$/, /^quick$/, /^latin$/, /^italian$/,
];

const PLACEHOLDER_DESC = 'A delicious and easy recipe that comes together quickly with simple ingredients.';
const PLACEHOLDER_TIP_FRAGMENT = 'Feel free to improvise — swap ingredients based on what you have';

const results = {
  upgraded: [],
  skipped_new: [],
  skipped_no_html: [],
  needs_manual: [],
  already_good: [],
};

// ── Checkpoint helpers ────────────────────────────────────────────────────────

function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    } catch (e) {}
  }
  return { done: [] };
}

function saveCheckpoint(checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), 'utf8');
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJSON(text) {
  // Strip markdown code fences
  let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  // Try direct parse first
  try {
    return JSON.parse(clean);
  } catch (e) {}

  // Find first { ... } block
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(clean.slice(start, end + 1));
    } catch (e) {}
  }

  // Last resort: try to extract fields manually with regex
  const fields = ['title', 'metaDesc', 'ogTitle', 'ogDesc', 'intro', 'tip'];
  const extracted = {};
  let found = 0;
  for (const field of fields) {
    const match = clean.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (match) {
      extracted[field] = match[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
      found++;
    }
  }
  if (found >= 4) return extracted;

  return null;
}

// ── Content extraction from HTML ──────────────────────────────────────────────

function extractContent(html) {
  const get = (pattern) => { const m = html.match(pattern); return m ? m[1].trim() : ''; };

  const title = get(/<title>(.*?)<\/title>/s);
  const metaDesc = get(/<meta name="description" content="(.*?)"/s);
  const intro = get(/<p class="recipe-desc">(.*?)<\/p>/s);
  const tip = get(/class="tip-label">.*?<\/div>\s*<p>(.*?)<\/p>/s);
  const nameMatch = html.match(/"name":"(.*?)"/);
  const recipeName = nameMatch ? nameMatch[1] : title.replace(/ \| Improv Oven$/, '').replace(/ - Improv Oven$/, '');

  const ingredients = get(/"recipeIngredient":\[(.*?)\]/s);
  const instructions = get(/"recipeInstructions":\[(.*?)\]/s);
  const category = get(/"recipeCategory":"(.*?)"/);
  const cuisine = get(/"recipeCuisine":"(.*?)"/);
  const prep = get(/stat-label">Prep<\/div><div class="stat-val">(.*?)<\/div>/);
  const cook = get(/stat-label">Cook<\/div><div class="stat-val">(.*?)<\/div>/);
  const serves = get(/stat-label">Serves<\/div><div class="stat-val">(.*?)<\/div>/);

  return {
    title, metaDesc, intro, tip, recipeName,
    ingredients, instructions, category, cuisine,
    prep, cook, serves,
    hasRealContent: ingredients.length > 50 && instructions.length > 50,
    isPlaceholder: metaDesc === PLACEHOLDER_DESC || intro.includes(PLACEHOLDER_TIP_FRAGMENT) || tip.includes(PLACEHOLDER_TIP_FRAGMENT),
  };
}

// ── HTML field replacement ────────────────────────────────────────────────────

function applyRewrites(html, seo) {
  const safeVal = v => (v || '').replace(/"/g, '&quot;');

  // title tag
  html = html.replace(/<title>.*?<\/title>/s, `<title>${seo.title}</title>`);

  // meta description
  html = html.replace(
    /<meta name="description" content=".*?"/s,
    `<meta name="description" content="${safeVal(seo.metaDesc)}"`
  );

  // og:title
  html = html.replace(
    /<meta property="og:title" content=".*?"/s,
    `<meta property="og:title" content="${safeVal(seo.ogTitle || seo.title)}"`
  );

  // og:description
  html = html.replace(
    /<meta property="og:description" content=".*?"/s,
    `<meta property="og:description" content="${safeVal(seo.ogDesc || seo.metaDesc)}"`
  );

  // recipe-desc intro paragraph
  html = html.replace(
    /<p class="recipe-desc">.*?<\/p>/s,
    `<p class="recipe-desc">${seo.intro}</p>`
  );

  // tip box paragraph — find the p tag inside tip-box
  html = html.replace(
    /(<div class="tip-box">[\s\S]*?<div class="tip-label">[\s\S]*?<\/div>\s*<p>)[\s\S]*?(<\/p>)/,
    `$1${seo.tip}$2`
  );

  return html;
}

// ── Claude API call with retry ────────────────────────────────────────────────

async function rewriteSEO(slug, content, attempt = 1) {
  const prompt = `You are writing SEO copy for Improv Oven, a food blog with simple budget-friendly recipes influenced by Miami and Latin American cooking.

Recipe slug: ${slug}
Recipe name: ${content.recipeName}
Category: ${content.category} | Cuisine: ${content.cuisine}
Prep: ${content.prep} | Cook: ${content.cook} | Serves: ${content.serves}
Ingredients: ${content.ingredients.substring(0, 600)}
Instructions: ${content.instructions.substring(0, 600)}

Return ONLY a raw JSON object. No markdown. No backticks. No explanation. Start with { and end with }.

{
  "title": "Page title under 60 chars. Format: [Recipe Name] - [key benefit] | Improv Oven",
  "metaDesc": "140-155 char meta description. Mention key ingredients, time, or unique angle. No generic phrases.",
  "ogTitle": "Same as title or slightly casual version",
  "ogDesc": "Punchy version of metaDesc under 100 chars",
  "intro": "2-3 sentence intro in Improv Oven voice. Conversational, specific to THIS recipe. No food blog fluff. Under 80 words.",
  "tip": "1-2 sentence practical cooking tip specific to this recipe. Something genuinely useful. Under 60 words."
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // faster + cheaper for batch work
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
      // 30 second timeout
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`API ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const parsed = extractJSON(text);

    if (!parsed) {
      console.log(`\n  Raw response: ${text.substring(0, 200)}`);
    }

    return parsed;

  } catch (err) {
    if (attempt < 3) {
      const wait = attempt * 3000;
      console.log(`\n  ⟳ Attempt ${attempt} failed (${err.message.substring(0, 60)}), retrying in ${wait/1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      return rewriteSEO(slug, content, attempt + 1);
    }
    console.log(`\n  ✗ Failed after 3 attempts: ${err.message.substring(0, 80)}`);
    return null;
  }
}

// ── Process one recipe folder ─────────────────────────────────────────────────

async function processRecipe(folderName) {
  const htmlPath = path.join(RECIPES_DIR, folderName, 'index.html');

  if (!fs.existsSync(htmlPath)) {
    results.skipped_no_html.push(folderName);
    process.stdout.write('no html\n');
    return;
  }

  let html = fs.readFileSync(htmlPath, 'utf8');
  const content = extractContent(html);

  if (!content.hasRealContent) {
    results.needs_manual.push({
      slug: folderName,
      reason: 'No ingredients/instructions in schema — placeholder or malformed',
      title: content.title,
    });
    process.stdout.write('⚠ needs manual\n');
    return;
  }

  if (!content.isPlaceholder) {
    results.already_good.push(folderName);
    process.stdout.write('already good\n');
    return;
  }

  process.stdout.write('rewriting... ');
  const seo = await rewriteSEO(folderName, content);

  if (!seo) {
    results.needs_manual.push({
      slug: folderName,
      reason: 'API returned unparseable response after 3 attempts',
      title: content.title,
    });
    process.stdout.write('✗ failed\n');
    return;
  }

  html = applyRewrites(html, seo);
  fs.writeFileSync(htmlPath, html, 'utf8');
  results.upgraded.push({ slug: folderName, newTitle: seo.title });
  process.stdout.write(`✓ done\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set.\n   Run: export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  if (!fs.existsSync(RECIPES_DIR)) {
    console.error('❌ /recipes/ not found. Run from the root of improvoven-site.');
    process.exit(1);
  }

  const checkpoint = loadCheckpoint();
  const alreadyDone = new Set(checkpoint.done || []);

  if (alreadyDone.size > 0) {
    console.log(`\n▶ Resuming — ${alreadyDone.size} recipes already completed in previous run`);
  }

  const folders = fs.readdirSync(RECIPES_DIR)
    .filter(f => fs.statSync(path.join(RECIPES_DIR, f)).isDirectory())
    .filter(f => !SKIP_PATTERNS.some(p => p.test(f)));

  const toProcess = folders.filter(f => !alreadyDone.has(f));

  console.log(`\n🔍 ${folders.length} legacy folders total`);
  console.log(`📋 ${toProcess.length} remaining to process\n`);

  for (let i = 0; i < toProcess.length; i++) {
    const folder = toProcess[i];
    process.stdout.write(`[${i + 1}/${toProcess.length}] ${folder}... `);

    await processRecipe(folder);

    // Save checkpoint after every recipe
    checkpoint.done = [...alreadyDone, ...results.upgraded.map(r => r.slug), ...results.already_good, ...results.needs_manual.map(r => r.slug), ...results.skipped_no_html];
    saveCheckpoint(checkpoint);

    // Delay between calls — longer to avoid connection drops
    if (i < toProcess.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // ── Print report ──────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(60));
  console.log('AUDIT REPORT');
  console.log('='.repeat(60));

  console.log(`\n✅ UPGRADED (${results.upgraded.length}):`);
  results.upgraded.forEach(r => console.log(`   ${r.slug}\n     → ${r.newTitle}`));

  console.log(`\n⭐ ALREADY GOOD — skipped (${results.already_good.length}):`);
  results.already_good.forEach(r => console.log(`   ${r}`));

  console.log(`\n⚠️  NEEDS MANUAL REVIEW (${results.needs_manual.length}):`);
  results.needs_manual.forEach(r => console.log(`   ${r.slug}\n     Reason: ${r.reason}`));

  console.log(`\n📁 NO HTML FOUND (${results.skipped_no_html.length}):`);
  results.skipped_no_html.forEach(r => console.log(`   ${r}`));

  console.log(`\n📊 SUMMARY:`);
  console.log(`   Upgraded:      ${results.upgraded.length}`);
  console.log(`   Already good:  ${results.already_good.length}`);
  console.log(`   Needs manual:  ${results.needs_manual.length}`);
  console.log(`   No HTML:       ${results.skipped_no_html.length}`);
  console.log(`   Total checked: ${folders.length}`);

  fs.writeFileSync(REPORT_FILE, JSON.stringify({
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
  }, null, 2), 'utf8');

  // Clean up checkpoint on successful completion
  if (fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
  }

  console.log('\n📄 Report saved to audit-report.json');
  console.log('🚀 Now run: git add . && git commit -m "batch SEO upgrade legacy recipes" && git push\n');
}

main().catch(err => {
  console.error('\n💥 Unexpected error:', err.message);
  console.log('   Run the script again — it will resume from where it left off.');
  process.exit(1);
});
