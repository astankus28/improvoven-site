const https = require('https');
const fs = require('fs');
const path = require('path');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

// ============================================================
// KEYWORD POOL — 150 high-intent, low-competition recipe searches
// Script picks one unused keyword per day, tracks used ones,
// resets automatically when all 150 have been used.
// Add new keywords any time by editing this file.
// ============================================================
const KEYWORD_POOL = [
  // BUDGET
  "cheap chicken dinner ideas under $10",
  "budget friendly pasta recipes",
  "meals to make with ground beef under $10",
  "cheap and easy weeknight dinners",
  "budget meal prep ideas for the week",
  "inexpensive family dinner ideas",
  "affordable healthy dinner recipes",
  "meals under $5 per serving",
  "budget friendly soup recipes",
  "cheap rice and beans recipes",
  "inexpensive chicken thigh recipes",
  "budget friendly casserole recipes",
  "cheap dinner ideas for two",
  "affordable meal ideas with pantry staples",
  "cheap ground turkey recipes",
  "budget friendly egg recipes for dinner",
  "cheap tuna recipes",
  "inexpensive vegetarian dinner ideas",
  "budget friendly slow cooker meals",
  "cheap protein meals on a budget",

  // PANTRY STAPLES
  "what to make with rice and canned tomatoes",
  "recipes using pantry staples only",
  "what to cook with chicken and rice",
  "easy recipes with canned beans",
  "what to make with pasta and olive oil",
  "easy dinner with canned tomatoes",
  "what to make with eggs and potatoes",
  "easy recipes with dried lentils",
  "what to cook with chickpeas",
  "recipes using canned coconut milk",
  "what to make with oats besides oatmeal",
  "easy dinner with frozen vegetables",
  "what to cook with leftover rice",
  "recipes using bread crumbs",
  "what to make with canned sardines",
  "easy meals with peanut butter",
  "what to cook with black beans",
  "recipes using cornmeal",
  "what to make with canned tuna and pasta",
  "easy dinner with ground beef and potatoes",

  // LATIN AND MIAMI INFLUENCED
  "easy Cuban black beans and rice recipe",
  "simple arroz con pollo recipe",
  "easy homemade sofrito recipe",
  "quick Cuban sandwich recipe",
  "simple ropa vieja recipe",
  "easy tostones recipe",
  "homemade Cuban picadillo recipe",
  "easy Colombian arepas recipe",
  "simple Venezuelan pabellon criollo recipe",
  "easy Puerto Rican rice recipe",
  "homemade chimichurri sauce recipe",
  "simple beef empanadas recipe",
  "easy Mexican rice recipe",
  "quick beef tacos recipe",
  "simple guacamole recipe from scratch",
  "easy Cuban mojo chicken recipe",
  "simple pernil recipe easy",
  "easy Cuban bread recipe homemade",
  "homemade salsa verde recipe",
  "simple elote street corn recipe",
  "easy Brazilian chicken rice recipe",
  "simple Dominican rice recipe",
  "easy Haitian rice and beans recipe",
  "simple ceviche recipe easy",
  "easy green plantain recipes",

  // COMFORT FOOD
  "easy homemade mac and cheese recipe",
  "simple beef stew recipe",
  "easy chicken pot pie recipe",
  "homemade meatloaf recipe easy",
  "simple shepherd's pie recipe",
  "easy fried chicken recipe at home",
  "homemade chicken noodle soup recipe",
  "simple baked ziti recipe",
  "easy lasagna recipe from scratch",
  "homemade chili recipe easy",
  "simple pot roast recipe",
  "easy chicken and dumplings recipe",
  "homemade beef stroganoff recipe",
  "simple chicken parmesan recipe",
  "easy stuffed peppers recipe",
  "homemade mashed potatoes recipe",
  "simple tuna noodle casserole recipe",
  "easy french onion soup recipe",
  "simple beef chili recipe easy",
  "easy baked chicken thighs recipe",

  // QUICK WEEKNIGHT
  "easy 20 minute chicken dinner",
  "quick weeknight pasta recipe",
  "15 minute stir fry recipe",
  "easy 30 minute dinner ideas",
  "quick salmon recipe under 20 minutes",
  "fast shrimp recipes for dinner",
  "quick and easy steak recipe",
  "easy 20 minute soup recipe",
  "fast weeknight chicken recipe",
  "quick pork chop recipe easy",
  "easy 15 minute egg fried rice",
  "fast homemade pizza recipe",
  "quick chicken quesadilla recipe",
  "easy 20 minute beef and broccoli",
  "fast homemade burger recipe",
  "quick vegetable stir fry recipe",
  "easy pan seared chicken recipe",
  "fast shrimp tacos recipe",
  "quick turkey meatball recipe",
  "easy 30 minute chicken curry recipe",

  // BREAKFAST AND BRUNCH
  "easy homemade pancake recipe from scratch",
  "simple French toast recipe",
  "easy breakfast burrito recipe",
  "homemade waffle recipe easy",
  "simple shakshuka recipe",
  "easy breakfast casserole recipe",
  "simple avocado toast recipe ideas",
  "easy egg muffin recipe",
  "homemade granola recipe easy",
  "simple breakfast hash recipe",

  // SOUPS AND STEWS
  "easy chicken tortilla soup recipe",
  "simple lentil soup recipe",
  "easy black bean soup recipe",
  "homemade tomato soup recipe easy",
  "simple potato soup recipe",
  "easy minestrone soup recipe",
  "homemade vegetable soup recipe",
  "simple white bean soup recipe",
  "easy Cuban black bean soup recipe",
  "homemade chicken vegetable soup recipe",

  // SALADS AND SIDES
  "easy pasta salad recipe",
  "simple coleslaw recipe",
  "easy roasted vegetables recipe",
  "homemade potato salad recipe easy",
  "simple cucumber salad recipe",
  "easy rice pilaf recipe",
  "homemade cornbread recipe easy",
  "simple garlic bread recipe",
  "easy roasted sweet potatoes recipe",
  "homemade coleslaw recipe easy",

  // SAUCES AND BASICS
  "easy homemade marinara sauce recipe",
  "simple garlic butter sauce recipe",
  "easy homemade salsa recipe",
  "simple pesto recipe easy",
  "easy teriyaki sauce recipe homemade",
  "homemade BBQ sauce recipe easy",
  "simple hollandaise sauce recipe",
  "easy cheese sauce recipe",
  "homemade hot sauce recipe easy",
  "simple curry sauce recipe",

  // SEAFOOD
  "easy garlic butter shrimp recipe",
  "simple baked salmon recipe",
  "easy fish tacos recipe",
  "homemade crab cakes recipe easy",
  "simple shrimp fried rice recipe",
  "easy lemon butter cod recipe",
  "simple shrimp pasta recipe",
  "easy tuna patties recipe",
  "homemade fish stew recipe easy",
  "simple pan seared tilapia recipe",
];

function getNextKeyword() {
  const usedPath = path.join(process.cwd(), 'used-keywords.json');
  let used = [];
  if (fs.existsSync(usedPath)) {
    used = JSON.parse(fs.readFileSync(usedPath, 'utf8'));
  }

  const unused = KEYWORD_POOL.filter(k => !used.includes(k));

  if (unused.length === 0) {
    console.log('All keywords used — resetting pool for another round');
    used = [];
    fs.writeFileSync(usedPath, JSON.stringify([], null, 2));
    return KEYWORD_POOL[Math.floor(Math.random() * KEYWORD_POOL.length)];
  }

  const keyword = unused[Math.floor(Math.random() * unused.length)];
  used.push(keyword);
  fs.writeFileSync(usedPath, JSON.stringify(used, null, 2));
  return keyword;
}

function httpsPost(hostname, pathStr, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname, path: pathStr, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch(e) { reject(new Error('Parse error: ' + chunks.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` }
    };
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch(e) { reject(new Error('Parse error: ' + chunks.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function generateRecipe(keyword) {
  console.log(`Generating recipe for: "${keyword}"`);

  const response = await httpsPost(
    'api.anthropic.com',
    '/v1/messages',
    {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are the voice of Improv Oven — a food blog with the tagline "cure refrigerator blindness."
The blog is about improvising with pantry ingredients to make delicious, affordable meals.
Tone: casual, warm, encouraging — like a knowledgeable Miami friend teaching you to cook.
Strong Miami influence with Latin American and Caribbean flair.
All recipes should be genuinely budget-friendly and achievable for home cooks.

Write a recipe that will rank on Google for: "${keyword}"

SEO RULES (critical):
- Recipe title must naturally contain the keyword or a very close variation
- First sentence of description must naturally include the keyword
- Never sound like an SEO robot — keep the Improv Oven personality throughout
- Recipe must genuinely match what someone searching that term wants

Return ONLY valid JSON, no markdown, no backticks:
{
  "title": "Title naturally containing the keyword",
  "description": "2-3 sentences. First naturally uses the keyword. Casual Miami voice.",
  "prepTime": "10 mins",
  "cookTime": "20 mins", 
  "totalTime": "30 mins",
  "servings": "4",
  "cuisine": "American",
  "category": "Entree",
  "difficulty": "Easy",
  "cost": "Budget",
  "ingredients": ["quantity ingredient", "quantity ingredient"],
  "instructions": ["Full step.", "Full step."],
  "tips": "One genuinely useful tip in Improv Oven's voice",
  "targetKeyword": "${keyword}",
  "imagePrompt": "Professional food photography of [dish], warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing"
}`
      }]
    }
  );

  const text = response.content[0].text.trim()
    .replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  const recipe = JSON.parse(text);
  console.log(`✓ Recipe: "${recipe.title}"`);
  return recipe;
}

function downloadBinary(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      const urlObj = new URL(u);
      const req = https.request({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'GET' }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { return follow(res.headers.location); }
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => { fs.writeFileSync(destPath, Buffer.concat(chunks)); resolve(destPath); });
      });
      req.on('error', reject);
      req.end();
    };
    follow(url);
  });
}

async function getImage(recipe, slug) {
  console.log('Generating food photo...');

  const prompt = recipe.imagePrompt || `Professional food photography of ${recipe.title}, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing`;

  const prediction = await httpsPost(
    'api.replicate.com',
    '/v1/models/black-forest-labs/flux-schnell/predictions',
    { 'Content-Type': 'application/json', 'Authorization': `Token ${REPLICATE_API_TOKEN}` },
    { input: { prompt, num_outputs: 1, aspect_ratio: '16:9', output_format: 'webp', output_quality: 85 } }
  );

  if (!prediction.urls?.get) throw new Error('Replicate error: ' + JSON.stringify(prediction));

  let result;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    result = await httpsGet(prediction.urls.get);
    console.log(`Image: ${result.status}`);
    if (result.status === 'succeeded') break;
    if (result.status === 'failed') throw new Error('Replicate image failed');
  }

  if (!result?.output?.[0]) throw new Error('No image output from Replicate');

  const imgDir = path.join(process.cwd(), 'recipes', slug, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const imgPath = path.join(imgDir, 'hero.webp');
  await downloadBinary(result.output[0], imgPath);
  console.log('✓ Image saved');
  return `/recipes/${slug}/images/hero.webp`;
}

function slugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function buildRecipePage(recipe, imageUrl, slug, date) {
  const ingredientsList = recipe.ingredients
    .map(i => `<li itemprop="recipeIngredient">${i}</li>`).join('\n');

  const instructionsList = recipe.instructions
    .map((s, i) => `<li itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToStep">
      <span class="step-num">${i+1}</span><span itemprop="text">${s}</span></li>`).join('\n');

  const dateFormatted = new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${recipe.title} - Improv Oven</title>
<meta name="description" content="${recipe.description.replace(/"/g,'&quot;')}">
<meta name="keywords" content="${recipe.targetKeyword}, improv oven, easy recipes, budget meals">
<meta property="og:title" content="${recipe.title} - Improv Oven">
<meta property="og:description" content="${recipe.description.replace(/"/g,'&quot;')}">
<meta property="og:image" content="${imageUrl}">
<meta property="og:type" content="article">
<link rel="canonical" href="https://www.improvoven.com/recipes/${slug}/">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "${recipe.title.replace(/"/g,'\\"')}",
  "description": "${recipe.description.replace(/"/g,'\\"')}",
  "image": ["${imageUrl}"],
  "author": {"@type":"Organization","name":"Improv Oven","url":"https://www.improvoven.com"},
  "datePublished": "${date}",
  "prepTime": "PT${recipe.prepTime.replace(/\D/g,'')}M",
  "cookTime": "PT${recipe.cookTime.replace(/\D/g,'')}M",
  "totalTime": "PT${recipe.totalTime.replace(/\D/g,'')}M",
  "recipeYield": "${recipe.servings} servings",
  "recipeCategory": "${recipe.category}",
  "recipeCuisine": "${recipe.cuisine}",
  "keywords": "${recipe.targetKeyword}",
  "recipeIngredient": ${JSON.stringify(recipe.ingredients)},
  "recipeInstructions": ${JSON.stringify(recipe.instructions.map((s,i)=>({
    "@type":"HowToStep","position":i+1,"text":s})))}
}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--green:#2d6a4f;--green-light:#52b788;--cream:#faf7f2;--text:#1a1a1a;--muted:#666;--border:#e8e0d0}
body{background:var(--cream);color:var(--text);font-family:'Lato',sans-serif;font-size:17px;line-height:1.7}
a{color:var(--green);text-decoration:none}a:hover{color:var(--green-light)}
nav{background:#fff;border-bottom:1px solid var(--border);padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.nav-logo{font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:var(--green)}
.nav-logo span{font-style:italic;font-weight:400}
.nav-links{display:flex;gap:2rem;list-style:none}
.nav-links a{font-size:0.85rem;letter-spacing:0.05em;text-transform:uppercase;color:var(--muted);font-weight:700}
.nav-links a:hover{color:var(--green)}
.recipe-hero{width:100%;aspect-ratio:16/9;max-height:520px;overflow:hidden}
.recipe-hero img{width:100%;height:100%;object-fit:cover}
.recipe-wrap{max-width:800px;margin:0 auto;padding:3rem 2rem}
.recipe-meta-top{display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem}
.tag{font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;background:var(--green);color:#fff;padding:0.25rem 0.7rem}
.tag.budget{background:#b5832a}
.recipe-title{font-family:'Playfair Display',serif;font-size:clamp(2rem,5vw,3rem);font-weight:700;line-height:1.15;margin-bottom:1rem}
.recipe-date{font-size:0.82rem;color:var(--muted);margin-bottom:1.5rem}
.recipe-desc{font-size:1.05rem;color:#444;line-height:1.85;margin-bottom:2.5rem;border-left:3px solid var(--green-light);padding-left:1.2rem;font-style:italic}
.recipe-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border);border:1px solid var(--border);margin-bottom:3rem}
.stat{background:#fff;padding:1.2rem;text-align:center}
.stat-label{font-size:0.68rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:0.3rem}
.stat-val{font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:700;color:var(--green)}
h2{font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;margin-bottom:1.2rem;padding-bottom:0.5rem;border-bottom:2px solid var(--green-light)}
.ingredients-list{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 2rem;margin-bottom:3rem}
.ingredients-list li{padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.95rem}
.ingredients-list li::before{content:'◆';color:var(--green-light);font-size:0.5rem;margin-right:0.6rem;vertical-align:middle}
.instructions-list{list-style:none;display:flex;flex-direction:column;gap:1.5rem;margin-bottom:3rem}
.instructions-list li{display:flex;gap:1.2rem;align-items:flex-start}
.step-num{flex-shrink:0;width:32px;height:32px;background:var(--green);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;margin-top:0.2rem}
.tip-box{background:#fff;border:1px solid var(--border);border-left:4px solid var(--green);padding:1.5rem;margin-bottom:3rem}
.tip-label{font-size:0.72rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--green);font-weight:700;margin-bottom:0.5rem}
.back-link{display:inline-block;margin-bottom:2rem;font-size:0.85rem;letter-spacing:0.05em;text-transform:uppercase;font-weight:700}
.back-link::before{content:'← '}
footer{background:#fff;border-top:1px solid var(--border);padding:2rem;text-align:center;font-size:0.82rem;color:var(--muted);margin-top:4rem}
@media(max-width:600px){.recipe-stats{grid-template-columns:repeat(2,1fr)}.ingredients-list{grid-template-columns:1fr}.nav-links{display:none}}
</style>
</head>
<body>
<nav>
  <a href="/" class="nav-logo">Improv <span>Oven</span></a>
  <ul class="nav-links">
    <li><a href="/recipes/">Recipes</a></li>
    <li><a href="/about/">About</a></li>
  </ul>
</nav>
<div class="recipe-hero">
  <img src="${imageUrl}" alt="${recipe.title}" fetchpriority="high">
</div>
<div class="recipe-wrap">
  <a href="/recipes/" class="back-link">All Recipes</a>
  <div class="recipe-meta-top">
    <span class="tag">${recipe.category}</span>
    <span class="tag">${recipe.cuisine}</span>
    <span class="tag">${recipe.difficulty||'Easy'}</span>
    <span class="tag budget">${recipe.cost||'Budget'}</span>
  </div>
  <h1 class="recipe-title">${recipe.title}</h1>
  <div class="recipe-date">Published ${dateFormatted} · Improv Oven</div>
  <p class="recipe-desc">${recipe.description}</p>
  <div class="recipe-stats">
    <div class="stat"><div class="stat-label">Prep</div><div class="stat-val">${recipe.prepTime}</div></div>
    <div class="stat"><div class="stat-label">Cook</div><div class="stat-val">${recipe.cookTime}</div></div>
    <div class="stat"><div class="stat-label">Total</div><div class="stat-val">${recipe.totalTime}</div></div>
    <div class="stat"><div class="stat-label">Serves</div><div class="stat-val">${recipe.servings}</div></div>
  </div>
  <h2>Ingredients</h2>
  <ul class="ingredients-list">${ingredientsList}</ul>
  <h2>Instructions</h2>
  <ol class="instructions-list">${instructionsList}</ol>
  <div class="tip-box">
    <div class="tip-label">💡 Improv Tip</div>
    <p>${recipe.tips}</p>
  </div>
</div>
<footer>© ${new Date().getFullYear()} Improv Oven · <a href="/">Home</a> · <a href="/recipes/index.html">All Recipes</a> · <a href="/privacy-policy/">Privacy Policy</a></footer>
</body>
</html>`;
}

async function updateRecipeIndex(recipes) {
  const indexPath = path.join(process.cwd(), 'recipes', 'index.html');
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });

  const cards = recipes.slice(0, 100).map(r => `
    <a href="/recipes/${r.slug}/" class="recipe-card">
      <div class="card-img"><img src="${r.image}" alt="${r.title}" loading="lazy"></div>
      <div class="card-body">
        <div class="card-tags"><span class="ctag">${r.category}</span><span class="ctag">${r.cuisine}</span></div>
        <h3>${r.title}</h3>
        <p>${r.description.slice(0,120)}...</p>
        <div class="card-meta">${r.totalTime} · Serves ${r.servings}</div>
      </div>
    </a>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Recipes - Improv Oven | Simple Budget-Friendly Meals</title>
<meta name="description" content="Browse ${recipes.length}+ simple budget-friendly recipes with Miami and Latin American influence. Quick weeknight meals using pantry staples.">
<link rel="canonical" href="https://www.improvoven.com/recipes/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--green:#2d6a4f;--green-light:#52b788;--cream:#faf7f2;--text:#1a1a1a;--muted:#666;--border:#e8e0d0}
body{background:var(--cream);color:var(--text);font-family:'Lato',sans-serif}
a{color:var(--green);text-decoration:none}
nav{background:#fff;border-bottom:1px solid var(--border);padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.nav-logo{font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:var(--green)}
.nav-logo span{font-style:italic;font-weight:400}
.nav-links{display:flex;gap:2rem;list-style:none}
.nav-links a{font-size:0.85rem;letter-spacing:0.05em;text-transform:uppercase;color:var(--muted);font-weight:700}
.nav-links a:hover{color:var(--green)}
.page-header{max-width:1100px;margin:0 auto;padding:3rem 2rem 1rem}
.page-header h1{font-family:'Playfair Display',serif;font-size:2.5rem;font-weight:700;margin-bottom:0.5rem}
.page-header p{color:var(--muted)}
.recipes-grid{max-width:1100px;margin:0 auto;padding:2rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:2rem}
.recipe-card{background:#fff;border:1px solid var(--border);overflow:hidden;transition:transform .2s,box-shadow .2s;display:flex;flex-direction:column}
.recipe-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.08)}
.card-img{aspect-ratio:16/9;overflow:hidden}
.card-img img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
.recipe-card:hover .card-img img{transform:scale(1.04)}
.card-body{padding:1.2rem 1.4rem;flex:1;display:flex;flex-direction:column}
.card-tags{display:flex;gap:0.4rem;margin-bottom:0.7rem;flex-wrap:wrap}
.ctag{font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;background:var(--green);color:#fff;padding:0.2rem 0.5rem}
.card-body h3{font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:700;margin-bottom:0.5rem;color:var(--text);line-height:1.3}
.card-body p{font-size:0.88rem;color:var(--muted);line-height:1.6;flex:1;margin-bottom:0.8rem}
.card-meta{font-size:0.75rem;color:var(--green);font-weight:700;letter-spacing:0.05em;text-transform:uppercase}
footer{background:#fff;border-top:1px solid var(--border);padding:2rem;text-align:center;font-size:0.82rem;color:var(--muted);margin-top:2rem}
@media(max-width:600px){.nav-links{display:none}.recipes-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<nav>
  <a href="/" class="nav-logo">Improv <span>Oven</span></a>
  <ul class="nav-links">
    <li><a href="/recipes/">Recipes</a></li>
    <li><a href="/about/">About</a></li>
  </ul>
</nav>
<div class="page-header">
  <h1>All Recipes</h1>
  <p>Simple dishes with simple ingredients — ${recipes.length} recipe${recipes.length!==1?'s':''} and counting.</p>
</div>
<div class="recipes-grid">${cards||'<p style="grid-column:1/-1;text-align:center;color:#999;padding:3rem">First recipe coming soon!</p>'}</div>
<footer>© ${new Date().getFullYear()} Improv Oven · <a href="/">Home</a> · <a href="/recipes/index.html">All Recipes</a> · <a href="/privacy-policy/">Privacy Policy</a></footer>
</body>
</html>`;

  fs.writeFileSync(indexPath, html);
  console.log(`✓ Recipe index updated (${recipes.length} recipes)`);
}


async function updateSitemap(recipes) {
  const baseUrl = 'https://www.improvoven.com';
  const today = new Date().toISOString().split('T')[0];
  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/recipes/index.html', priority: '0.9', changefreq: 'daily' },
    { url: '/about/index.html', priority: '0.5', changefreq: 'monthly' },
  ];
  const recipeUrls = recipes.map(r => `  <url>\n    <loc>${baseUrl}/recipes/${r.slug}/</loc>\n    <lastmod>${r.date || today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`).join('\n');
  const staticUrls = staticPages.map(p => `  <url>\n    <loc>${baseUrl}${p.url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`).join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticUrls}\n${recipeUrls}\n</urlset>`;
  fs.writeFileSync(path.join(process.cwd(), 'sitemap.xml'), sitemap);
  console.log(`✓ Sitemap updated (${recipes.length + staticPages.length} URLs)`);
}

async function main() {
  try {
    const keyword = getNextKeyword();
    console.log(`\n🎯 Target keyword: "${keyword}"\n`);

    const recipe = await generateRecipe(keyword);

    const date = new Date().toISOString().split('T')[0];
    const slug = slugify(recipe.title) + '-' + date;
    const recipeDir = path.join(process.cwd(), 'recipes', slug);
    fs.mkdirSync(recipeDir, { recursive: true });

    const imageUrl = await getImage(recipe, slug);

    const html = buildRecipePage(recipe, imageUrl, slug, date);
    fs.writeFileSync(path.join(recipeDir, 'index.html'), html);

    const recipesDataPath = path.join(process.cwd(), 'recipes-data.json');
    let recipes = [];
    if (fs.existsSync(recipesDataPath)) {
      recipes = JSON.parse(fs.readFileSync(recipesDataPath, 'utf8'));
    }
    recipes.unshift({ slug, title: recipe.title, description: recipe.description,
      image: imageUrl, category: recipe.category, cuisine: recipe.cuisine,
      totalTime: recipe.totalTime, servings: recipe.servings, keyword, date });
    fs.writeFileSync(recipesDataPath, JSON.stringify(recipes, null, 2));

    await updateRecipeIndex(recipes);
    await updateSitemap(recipes);

    console.log(`\n✅ Published: "${recipe.title}"`);
    console.log(`   Keyword: "${keyword}"`);
    console.log(`   URL: /recipes/${slug}/`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();
