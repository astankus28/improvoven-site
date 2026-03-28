// scripts/refresh-keywords.js
// Runs monthly to update keyword pool with trending food searches
// Uses Claude API with web search to find what's trending

const https = require('https');
const fs = require('fs');
const path = require('path');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function callClaude(messages, useWebSearch = false) {
  return new Promise((resolve, reject) => {
    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages,
      ...(useWebSearch ? {
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search'
        }]
      } : {})
    };

    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(response);
          // Extract text from content blocks
          const text = parsed.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('');
          resolve(text);
        } catch (e) {
          reject(new Error('Parse error: ' + response.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getTrendingKeywords() {
  console.log('🔍 Searching for trending food keywords...');

  const prompt = `You are a food SEO expert helping update the keyword pool for Improv Oven, a food blog focused on:
- Quick, budget-friendly recipes
- Miami/Latin American influence (Cuban, Puerto Rican, Venezuelan, Argentine, Mexican)
- Pantry staple cooking
- Weeknight meals for busy home cooks

Search the web for:
1. Trending food recipe searches right now (Google Trends, Pinterest trends)
2. What recipe keywords have high search volume but low competition in 2026
3. New food trends gaining traction (TikTok food trends, viral recipes)
4. Seasonal recipe searches that are currently popular

Then generate exactly 60 new recipe keyword phrases that:
- Are 4-8 words long
- Include action words (easy, simple, homemade, quick, best)
- Target real search intent ("easy [dish] recipe" format)
- Fit the Improv Oven brand (budget, quick, Latin/Miami influence)
- Are NOT already common (avoid overused terms like "easy chicken recipe")
- Include a mix of: 20 dinner keywords, 10 breakfast keywords, 10 dessert keywords, 10 lunch keywords, 10 trending/seasonal keywords

Return ONLY a JSON array of strings, no other text:
["keyword 1", "keyword 2", ...]`;

  const response = await callClaude([
    { role: 'user', content: prompt }
  ], true);

  // Parse JSON from response
  const match = response.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array found in response');
  return JSON.parse(match[0]);
}

async function main() {
  console.log('🔄 Starting monthly keyword refresh...\n');

  // Load current generate-recipe.js
  const scriptPath = path.join(process.cwd(), 'scripts', 'generate-recipe.js');
  let script = fs.readFileSync(scriptPath, 'utf8');

  // Get new trending keywords
  const newKeywords = await getTrendingKeywords();
  console.log(`✓ Got ${newKeywords.length} new trending keywords`);

  // Load current keyword pool
  const poolMatch = script.match(/const KEYWORD_POOL = \[([\s\S]*?)\];/);
  if (!poolMatch) throw new Error('Could not find KEYWORD_POOL in script');

  const currentKeywords = [];
  const kwMatches = poolMatch[1].matchAll(/"([^"]+)"/g);
  for (const m of kwMatches) {
    currentKeywords.push(m[1]);
  }
  console.log(`📊 Current pool size: ${currentKeywords.length} keywords`);

  // Merge — add new keywords that aren't already in pool
  const combined = [...new Set([...currentKeywords, ...newKeywords])];
  
  // Keep pool manageable — max 350 keywords
  // If over limit, remove oldest non-recent keywords
  const MAX_POOL = 350;
  let finalPool = combined;
  if (combined.length > MAX_POOL) {
    // Keep all new keywords + as many original as fit
    const slots = MAX_POOL - newKeywords.length;
    finalPool = [...newKeywords, ...currentKeywords.slice(0, slots)];
    finalPool = [...new Set(finalPool)];
  }

  console.log(`✓ New pool size: ${finalPool.length} keywords`);

  // Categorize new keywords
  const categories = {
    budget: finalPool.filter(k => /budget|cheap|affordable|under \$|inexpensive/.test(k)),
    breakfast: finalPool.filter(k => /breakfast|pancake|waffle|french toast|oatmeal|granola|morning|brunch/.test(k)),
    latin: finalPool.filter(k => /cuban|mexican|latin|puerto rican|venezuelan|argentine|haitian|colombian|peruvian|sofrito|tostones|empanada|arepas|tamale|birria|ceviche/.test(k)),
    dessert: finalPool.filter(k => /cookie|cake|brownie|dessert|pudding|flan|churro|tres leches|cheesecake|dulce|alfajor|tiramisu|cobbler|crisp/.test(k)),
    quick: finalPool.filter(k => /\d+ minute|quick|fast/.test(k)),
  };

  // Build new KEYWORD_POOL string
  const poolLines = finalPool.map(k => `  "${k}",`).join('\n');
  const newPoolStr = `const KEYWORD_POOL = [\n${poolLines}\n];`;

  // Replace in script
  const newScript = script.replace(/const KEYWORD_POOL = \[[\s\S]*?\];/, newPoolStr);
  fs.writeFileSync(scriptPath, newScript);

  // Save refresh log
  const logPath = path.join(process.cwd(), 'keyword-refresh-log.json');
  const log = {
    date: new Date().toISOString(),
    previousCount: currentKeywords.length,
    newKeywords: newKeywords.length,
    added: newKeywords.filter(k => !currentKeywords.includes(k)).length,
    totalPool: finalPool.length,
    newKeywordsSample: newKeywords.slice(0, 10)
  };
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

  console.log(`\n✅ Keyword pool refreshed!`);
  console.log(`   Previous: ${currentKeywords.length} keywords`);
  console.log(`   Added: ${newKeywords.filter(k => !currentKeywords.includes(k)).length} new keywords`);
  console.log(`   Total: ${finalPool.length} keywords`);
  console.log('\nSample new keywords:');
  newKeywords.slice(0, 5).forEach(k => console.log(`   - ${k}`));
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
