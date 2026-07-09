#!/usr/bin/env node
/**
 * research-trends.js
 *
 * Weekly trend research script.
 * Scrapes food-related subreddits and the Google Trends RSS feed, then
 * compares the discovered topics against your existing recipe catalog to
 * surface content gaps you should cover.
 *
 * Outputs:
 *   - Console summary (human-readable)
 *   - trend-report.json  (machine-readable, read by future automation)
 *   - Optionally appends top gaps to priority-keywords.json for the
 *     next recipe-generation run (pass --inject-top N)
 *
 * Usage:
 *   node scripts/research-trends.js
 *   node scripts/research-trends.js --inject-top 5
 *   node scripts/research-trends.js --days 14 --inject-top 3
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DAYS = Number(args.find(a => a.startsWith('--days='))?.split('=')[1] ?? 7);
const INJECT_TOP = Number(args.find(a => a.startsWith('--inject-top='))?.split('=')[1] ?? 0);
const DRY_RUN = args.includes('--dry-run');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUBREDDITS = [
  { name: 'budgetfood',          weight: 3 },
  { name: 'EatCheapAndHealthy',  weight: 3 },
  { name: 'MealPrepSunday',      weight: 2 },
  { name: 'Cooking',             weight: 2 },
  { name: 'food',                weight: 1 },
  { name: 'Frugal',              weight: 1 },
  { name: 'recipes',             weight: 2 },
];

// Words that are too generic to be useful as recipe keywords
const STOP_WORDS = new Set([
  'the','and','for','with','from','this','that','have','just','like',
  'made','make','got','are','was','were','not','but','all','can','get',
  'my','me','our','your','we','they','it','its','i','you','he','she',
  'a','an','is','in','of','to','at','on','or','do','did','has',
  'had','be','by','so','up','how','now','new','old','one','two','use',
  'will','what','some','need','good','best','easy','recipe','recipes',
  'food','meal','dinner','lunch','breakfast','dish','week','day','time',
  'home','make','cook','cooked','cooking','homemade','simple','quick',
  'delicious','tasty','great','first','last','next','then','when',
  'budget','cheap','cost','price','tried','trying','here','there',
  'using','used','also','still','been','love','loved','great','post',
  'comment','share','help','anyone','anyone','thanks','thank','please',
  'question','advice','tip','tips','idea','ideas','think','thought',
  'anyone','bit','lot','way','ways','even','much','many','most',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Very light natural-language tokenizer: extract meaningful food n-grams
function extractFoodPhrases(text) {
  const clean = text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = clean.split(' ').filter(t => t.length > 2 && !STOP_WORDS.has(t));

  // Collect unigrams + bigrams + trigrams
  const phrases = [];
  for (let i = 0; i < tokens.length; i++) {
    phrases.push(tokens[i]);
    if (i + 1 < tokens.length) phrases.push(`${tokens[i]} ${tokens[i+1]}`);
    if (i + 2 < tokens.length) phrases.push(`${tokens[i]} ${tokens[i+1]} ${tokens[i+2]}`);
  }
  return phrases;
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Load existing catalog
// ---------------------------------------------------------------------------
function loadCatalog() {
  const dataPath = path.join(process.cwd(), 'recipes-data.json');
  if (!fs.existsSync(dataPath)) return [];
  try { return JSON.parse(fs.readFileSync(dataPath, 'utf8')); }
  catch (_) { return []; }
}

function buildCatalogIndex(catalog) {
  // Index every word in existing recipe titles + keywords
  const index = new Set();
  for (const r of catalog) {
    const text = `${r.title ?? ''} ${r.keyword ?? ''}`;
    for (const word of normalize(text).split(' ')) {
      if (word.length > 3) index.add(word);
    }
  }
  return index;
}

// Score how "covered" a phrase is by the existing catalog
function coverageScore(phrase, catalogIndex) {
  const words = normalize(phrase).split(' ').filter(w => w.length > 3);
  if (words.length === 0) return 1;
  const hits = words.filter(w => catalogIndex.has(w)).length;
  return hits / words.length;
}

// ---------------------------------------------------------------------------
// Fetch Reddit via RSS (no auth required; JSON API now requires OAuth)
// ---------------------------------------------------------------------------
function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'ImprovOven-TrendBot/1.0 (+https://improvoven.com)',
        'Accept': 'application/rss+xml, text/xml, */*',
      },
    };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow one redirect
        return fetchRaw(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        resolve(data);
      });
    }).on('error', reject);
  });
}

async function fetchSubreddit(subreddit, days) {
  const timeFilter = days <= 7 ? 'week' : 'month';
  const url = `https://www.reddit.com/r/${subreddit}/top.rss?t=${timeFilter}&limit=50`;
  try {
    const xml = await fetchRaw(url);

    // Parse RSS XML — extract <title> and score from <ups> inside each <entry>/<item>
    const posts = [];
    // Atom feed format Reddit uses
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    const titleRe = /<title[^>]*>([\s\S]*?)<\/title>/;
    const scoreRe = /<score>([\s\S]*?)<\/score>|<ups>([\s\S]*?)<\/ups>/;
    let m;
    while ((m = entryRe.exec(xml)) !== null) {
      const entry = m[1];
      const titleMatch = titleRe.exec(entry);
      const scoreMatch = scoreRe.exec(entry);
      const rawTitle = titleMatch?.[1] ?? '';
      // Strip CDATA and HTML entities
      const title = rawTitle
        .replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/<[^>]+>/g, '')
        .trim();
      const score = parseInt(scoreMatch?.[1] ?? scoreMatch?.[2] ?? '1', 10) || 1;
      if (title) posts.push({ title, score, subreddit });
    }
    return posts;
  } catch (err) {
    console.error(`  ⚠ Could not fetch r/${subreddit}: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fetch Google Trends daily RSS feed
// ---------------------------------------------------------------------------
async function fetchGoogleTrends() {
  const url = 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=US';
  try {
    const xml = await fetchRaw(url);
    const titles = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    const titleRe = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
      const t = titleRe.exec(m[1]);
      if (t) titles.push((t[1] ?? t[2] ?? '').trim());
    }
    return titles.slice(0, 20);
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Food-relevant signal words — phrase must contain at least one
const FOOD_SIGNALS = new Set([
  'chicken','beef','pork','fish','shrimp','salmon','tuna','turkey','lamb','tofu',
  'pasta','rice','bean','beans','lentil','lentils','soup','stew','chili','curry',
  'salad','sandwich','wrap','taco','burrito','pizza','burger','noodle','noodles',
  'bread','cake','cookie','muffin','pie','brownie','biscuit','scone','waffle',
  'pancake','egg','eggs','omelette','frittata','quiche','casserole','skillet',
  'stir','fry','bake','roast','grill','bbq','smoked','slow','instant','crockpot',
  'sauce','gravy','dressing','marinade','broth','stock','dip','hummus','salsa',
  'smoothie','lemonade','cocktail','mocktail','spritz','drink','juice','coffee',
  'cheese','butter','cream','milk','yogurt','avocado','tomato','potato','onion',
  'garlic','pepper','mushroom','spinach','kale','broccoli','carrot','corn','zucchini',
  'sweet','spicy','crispy','creamy','cheesy','crunchy','tender','juicy','fresh',
  'pickles','pickle','sauerkraut','kimchi','miso','tahini','pesto',
  'bowl','plate','meal','dinner','lunch','breakfast','snack','dessert','appetizer',
  'budget','cheap','frugal','affordable','pantry','leftovers','freezer','batch',
  'vegetarian','vegan','gluten','keto','paleo','mediterranean','protein','fiber',
  'chinese','mexican','italian','thai','indian','japanese','korean','greek',
  'cumin','coriander','turmeric','paprika','cayenne','oregano','basil','thyme',
  'mash','instant','canned','frozen','dried','smoked','pickled','fermented',
  'spiked','viral','trending','tiktok','air','fryer','pressure',
]);

// Score and rank discovered phrases
// ---------------------------------------------------------------------------
function rankPhrases(phraseMap, catalogIndex) {
  const results = [];
  for (const [phrase, score] of phraseMap.entries()) {
    if (phrase.split(' ').length < 2) continue; // skip unigrams in final ranking

    // Require at least one food-relevant word (keeps results actionable)
    const words = normalize(phrase).split(' ');
    const hasFoodWord = words.some(w => FOOD_SIGNALS.has(w));
    if (!hasFoodWord) continue;

    const coverage = coverageScore(phrase, catalogIndex);
    if (coverage >= 0.8) continue; // already well-covered

    results.push({
      phrase,
      redditScore: score,
      coverage: Math.round(coverage * 100),
      gap: Math.round((1 - coverage) * score),
    });
  }
  return results.sort((a, b) => b.gap - a.gap);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('🔍 ImprovOven Trend Research');
  console.log(`   Period: last ${DAYS} days\n`);

  const catalog = loadCatalog();
  const catalogIndex = buildCatalogIndex(catalog);
  console.log(`📚 Catalog: ${catalog.length} existing recipes\n`);

  // Collect Reddit posts
  const phraseMap = new Map(); // phrase → weighted score

  console.log('📡 Fetching Reddit posts…');
  for (const { name, weight } of SUBREDDITS) {
    process.stdout.write(`   r/${name}… `);
    const posts = await fetchSubreddit(name, DAYS);
    console.log(`${posts.length} posts`);

    for (const post of posts) {
      for (const phrase of extractFoodPhrases(post.title)) {
        const prev = phraseMap.get(phrase) ?? 0;
        phraseMap.set(phrase, prev + (post.score * weight));
      }
    }
    await sleep(1500); // be polite to Reddit (avoid 429)
  }

  // Collect Google Trends
  console.log('\n📡 Fetching Google Trends…');
  const trendTitles = await fetchGoogleTrends();
  console.log(`   ${trendTitles.length} trending searches found`);
  for (const title of trendTitles) {
    // Only add if food-related
    const foodSignals = ['recipe','food','cook','bake','eat','meal','dinner','lunch','breakfast',
      'chicken','beef','pork','fish','pasta','rice','bean','soup','salad','cake','cookie','bread',
      'taco','pizza','burger','noodle','sauce','stir','fry','roast','grill','bbq','drink','cocktail',
      'smoothie','lemonade','mocktail','spritz'];
    const lower = title.toLowerCase();
    if (foodSignals.some(s => lower.includes(s))) {
      for (const phrase of extractFoodPhrases(title)) {
        const prev = phraseMap.get(phrase) ?? 0;
        phraseMap.set(phrase, prev + 500); // fixed boost for Google trending
      }
    }
  }

  // Rank
  const ranked = rankPhrases(phraseMap, catalogIndex);
  const top30 = ranked.slice(0, 30);

  // Format output
  console.log('\n🏆 Top content gaps (trending but not well-covered in catalog):\n');
  const colW = [4, 35, 10, 9];
  console.log(
    '#'.padEnd(colW[0]) +
    'Phrase'.padEnd(colW[1]) +
    'Gap Score'.padEnd(colW[2]) +
    'Covered%'
  );
  console.log('─'.repeat(colW[0]+colW[1]+colW[2]+colW[3]));
  top30.forEach((r, i) => {
    console.log(
      String(i+1).padEnd(colW[0]) +
      r.phrase.padEnd(colW[1]) +
      String(r.gap).padEnd(colW[2]) +
      `${r.coverage}%`
    );
  });

  // Build keyword suggestions for recipe generation
  const suggestions = top30.slice(0, 10).map(r => `${r.phrase} budget recipe`);

  console.log('\n💡 Suggested keywords to add to recipe queue:');
  suggestions.forEach((s, i) => console.log(`   ${i+1}. ${s}`));

  // Save report
  const report = {
    generatedAt: new Date().toISOString(),
    days: DAYS,
    catalogSize: catalog.length,
    topGaps: top30,
    suggestions,
    googleTrendingTopics: trendTitles,
  };

  if (!DRY_RUN) {
    const reportPath = path.join(process.cwd(), 'trend-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Report saved to trend-report.json`);
  }

  // Optionally inject top N into priority-keywords.json
  if (INJECT_TOP > 0 && !DRY_RUN) {
    const queuePath = path.join(process.cwd(), 'priority-keywords.json');
    let existing = [];
    if (fs.existsSync(queuePath)) {
      try { existing = JSON.parse(fs.readFileSync(queuePath, 'utf8')); } catch (_) {}
    }
    const existingSet = new Set(existing.map(k => normalize(k)));
    const toAdd = suggestions
      .slice(0, INJECT_TOP)
      .filter(s => !existingSet.has(normalize(s)));

    const updated = [...existing, ...toAdd];
    fs.writeFileSync(queuePath, JSON.stringify(updated, null, 2));
    console.log(`🚀 Injected ${toAdd.length} new keywords into priority-keywords.json`);
    if (toAdd.length) console.log(toAdd.map((k, i) => `   ${i+1}. ${k}`).join('\n'));
  }

  console.log('\nDone! 🎉');
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { extractFoodPhrases, coverageScore, rankPhrases };
