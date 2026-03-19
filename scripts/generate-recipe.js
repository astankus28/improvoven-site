const https = require('https');
const fs = require('fs');
const path = require('path');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

// Recipe styles to rotate through
const styles = [
  "budget-friendly pantry staple meal under $10",
  "quick Miami-inspired Latin recipe under 30 minutes",
  "comfort food classic with simple ingredients",
  "quick weeknight meal with common pantry ingredients",
  "budget-friendly meal inspired by Caribbean or Latin American cuisine",
  "simple comfort food recipe ready in under 30 minutes",
  "Miami-influenced dish using affordable everyday ingredients",
];

function getStyle() {
  const day = new Date().getDay();
  return styles[day % styles.length];
}

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch(e) { reject(new Error('Parse error: ' + chunks)); }
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
        catch(e) { reject(new Error('Parse error: ' + chunks)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function generateRecipe() {
  const style = getStyle();
  console.log(`Generating recipe: ${style}`);

  const response = await httpsPost(
    'api.anthropic.com',
    '/v1/messages',
    {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are the voice of Improv Oven, a food blog with the tagline "cure refrigerator blindness." 
The blog is about improvising with simple pantry ingredients to make delicious meals. 
The tone is casual, friendly, and encouraging — like a knowledgeable friend helping you cook.
The blog has a Miami influence with appreciation for Latin American cuisine.

Generate a ${style} recipe. 

Respond ONLY with a valid JSON object, no markdown, no backticks, exactly this structure:
{
  "title": "Recipe Title",
  "description": "2-3 sentence description in the Improv Oven voice",
  "prepTime": "10 mins",
  "cookTime": "20 mins",
  "totalTime": "30 mins",
  "servings": "4",
  "cuisine": "American",
  "category": "Entree",
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["Step 1 instruction", "Step 2 instruction"],
  "tips": "One helpful tip in the Improv Oven voice",
  "imagePrompt": "A professional food photography shot of [dish name], warm golden lighting, shallow depth of field, rustic wooden table, appetizing and vibrant"
}`
      }]
    }
  );

  const text = response.content[0].text;
  const recipe = JSON.parse(text);
  console.log(`Recipe generated: ${recipe.title}`);
  return recipe;
}

async function generateImage(prompt) {
  console.log('Generating image...');

  // Start prediction
  const prediction = await httpsPost(
    'api.replicate.com',
    '/v1/models/black-forest-labs/flux-schnell/predictions',
    {
      'Content-Type': 'application/json',
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
    },
    {
      input: {
        prompt: prompt,
        num_outputs: 1,
        aspect_ratio: "16:9",
        output_format: "webp",
        output_quality: 85
      }
    }
  );

  if (!prediction.urls?.get) {
    throw new Error('No polling URL: ' + JSON.stringify(prediction));
  }

  // Poll until complete
  let result;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    result = await httpsGet(prediction.urls.get);
    console.log(`Image status: ${result.status}`);
    if (result.status === 'succeeded') break;
    if (result.status === 'failed') throw new Error('Image generation failed');
  }

  return result.output[0];
}

function slugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildRecipePage(recipe, imageUrl, slug, date) {
  const ingredientsList = recipe.ingredients
    .map(i => `<li itemprop="recipeIngredient">${i}</li>`)
    .join('\n              ');
  
  const instructionsList = recipe.instructions
    .map((step, idx) => `
              <li itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToStep">
                <span class="step-num">${idx + 1}</span>
                <span itemprop="text">${step}</span>
              </li>`).join('');

  const dateFormatted = new Date(date).toLocaleDateString('en-US', { 
    year: 'numeric', month: 'long', day: 'numeric' 
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${recipe.title} - Improv Oven</title>
<meta name="description" content="${recipe.description}">
<link rel="canonical" href="https://www.improvoven.com/recipes/${slug}/">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "${recipe.title}",
  "description": "${recipe.description}",
  "image": "${imageUrl}",
  "author": { "@type": "Organization", "name": "Improv Oven" },
  "datePublished": "${date}",
  "prepTime": "PT${recipe.prepTime.replace(' mins','')}M",
  "cookTime": "PT${recipe.cookTime.replace(' mins','')}M",
  "totalTime": "PT${recipe.totalTime.replace(' mins','')}M",
  "recipeYield": "${recipe.servings} servings",
  "recipeCategory": "${recipe.category}",
  "recipeCuisine": "${recipe.cuisine}",
  "recipeIngredient": ${JSON.stringify(recipe.ingredients)},
  "recipeInstructions": ${JSON.stringify(recipe.instructions.map((s,i) => ({ "@type": "HowToStep", "position": i+1, "text": s })))}
}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--green:#2d6a4f;--green-light:#52b788;--cream:#faf7f2;--text:#1a1a1a;--muted:#666;--border:#e8e0d0}
body{background:var(--cream);color:var(--text);font-family:'Lato',sans-serif;font-size:17px;line-height:1.7}
a{color:var(--green);text-decoration:none}
a:hover{color:var(--green-light)}
nav{background:#fff;border-bottom:1px solid var(--border);padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.nav-logo{font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:var(--green)}
.nav-links{display:flex;gap:2rem;list-style:none}
.nav-links a{font-size:0.85rem;letter-spacing:0.05em;text-transform:uppercase;color:var(--muted);font-weight:700}
.nav-links a:hover{color:var(--green)}
.recipe-hero{width:100%;aspect-ratio:16/9;max-height:520px;overflow:hidden}
.recipe-hero img{width:100%;height:100%;object-fit:cover}
.recipe-wrap{max-width:800px;margin:0 auto;padding:3rem 2rem}
.recipe-meta-top{display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem}
.tag{font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;background:var(--green);color:#fff;padding:0.25rem 0.7rem;border-radius:2px}
.recipe-title{font-family:'Playfair Display',serif;font-size:clamp(2rem,5vw,3rem);font-weight:700;line-height:1.15;margin-bottom:1rem;color:var(--text)}
.recipe-date{font-size:0.82rem;color:var(--muted);margin-bottom:1.5rem}
.recipe-desc{font-size:1.05rem;color:#444;line-height:1.8;margin-bottom:2.5rem;border-left:3px solid var(--green-light);padding-left:1.2rem;font-style:italic}
.recipe-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border);border:1px solid var(--border);margin-bottom:3rem}
.stat{background:#fff;padding:1.2rem;text-align:center}
.stat-label{font-size:0.68rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:0.3rem}
.stat-val{font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:700;color:var(--green)}
h2{font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:var(--text);margin-bottom:1.2rem;padding-bottom:0.5rem;border-bottom:2px solid var(--green-light)}
.ingredients-list{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 2rem;margin-bottom:3rem}
.ingredients-list li{padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.95rem}
.ingredients-list li::before{content:'◆';color:var(--green-light);font-size:0.5rem;margin-right:0.6rem;vertical-align:middle}
.instructions-list{list-style:none;display:flex;flex-direction:column;gap:1.5rem;margin-bottom:3rem}
.instructions-list li{display:flex;gap:1.2rem;align-items:flex-start}
.step-num{flex-shrink:0;width:32px;height:32px;background:var(--green);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;margin-top:0.2rem}
.tip-box{background:#fff;border:1px solid var(--border);border-left:4px solid var(--green);padding:1.5rem;margin-bottom:3rem;border-radius:0 4px 4px 0}
.tip-label{font-size:0.72rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--green);font-weight:700;margin-bottom:0.5rem}
.back-link{display:inline-block;margin-bottom:2rem;font-size:0.85rem;letter-spacing:0.05em;text-transform:uppercase;font-weight:700}
.back-link::before{content:'← '}
footer{background:#fff;border-top:1px solid var(--border);padding:2rem;text-align:center;font-size:0.82rem;color:var(--muted);margin-top:4rem}
@media(max-width:600px){.recipe-stats{grid-template-columns:repeat(2,1fr)}.ingredients-list{grid-template-columns:1fr}.nav-links{display:none}}
</style>
</head>
<body>
<nav>
  <a href="/" class="nav-logo">Improv Oven</a>
  <ul class="nav-links">
    <li><a href="/recipes/">Recipes</a></li>
    <li><a href="/about/">About</a></li>
  </ul>
</nav>
<div class="recipe-hero">
  <img src="${imageUrl}" alt="${recipe.title}" loading="lazy">
</div>
<div class="recipe-wrap">
  <a href="/recipes/" class="back-link">All Recipes</a>
  <div class="recipe-meta-top">
    <span class="tag">${recipe.category}</span>
    <span class="tag">${recipe.cuisine}</span>
  </div>
  <h1 class="recipe-title">${recipe.title}</h1>
  <div class="recipe-date">Published ${dateFormatted} by Improv Oven</div>
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
    <div class="tip-label">Improv Tip</div>
    <p>${recipe.tips}</p>
  </div>
</div>
<footer>
  © ${new Date().getFullYear()} Improv Oven · Simple recipes, simple ingredients · <a href="/">Home</a>
</footer>
</body>
</html>`;
}

async function updateIndex(recipes) {
  // Read existing index or create new
  const indexPath = path.join(process.cwd(), 'recipes', 'index.html');
  
  const recipeCards = recipes.slice(0, 50).map(r => `
    <a href="/recipes/${r.slug}/" class="recipe-card">
      <div class="card-img">
        <img src="${r.image}" alt="${r.title}" loading="lazy">
      </div>
      <div class="card-body">
        <div class="card-tags">
          <span class="ctag">${r.category}</span>
          <span class="ctag">${r.cuisine}</span>
        </div>
        <h3>${r.title}</h3>
        <p>${r.description}</p>
        <div class="card-meta">${r.totalTime} · Serves ${r.servings}</div>
      </div>
    </a>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Recipes - Improv Oven</title>
<meta name="description" content="Simple recipes using pantry staples. Budget-friendly, quick weeknight meals with Miami and Latin American influence.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--green:#2d6a4f;--green-light:#52b788;--cream:#faf7f2;--text:#1a1a1a;--muted:#666;--border:#e8e0d0}
body{background:var(--cream);color:var(--text);font-family:'Lato',sans-serif}
a{color:var(--green);text-decoration:none}
nav{background:#fff;border-bottom:1px solid var(--border);padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.nav-logo{font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:var(--green)}
.nav-links{display:flex;gap:2rem;list-style:none}
.nav-links a{font-size:0.85rem;letter-spacing:0.05em;text-transform:uppercase;color:var(--muted);font-weight:700}
.nav-links a:hover{color:var(--green)}
.page-header{max-width:1100px;margin:0 auto;padding:3rem 2rem 1rem}
.page-header h1{font-family:'Playfair Display',serif;font-size:2.5rem;font-weight:700;margin-bottom:0.5rem}
.page-header p{color:var(--muted);font-size:1rem}
.recipes-grid{max-width:1100px;margin:0 auto;padding:2rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:2rem}
.recipe-card{background:#fff;border:1px solid var(--border);overflow:hidden;transition:transform .2s,box-shadow .2s;display:flex;flex-direction:column}
.recipe-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.08)}
.card-img{aspect-ratio:16/9;overflow:hidden}
.card-img img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
.recipe-card:hover .card-img img{transform:scale(1.03)}
.card-body{padding:1.2rem;flex:1;display:flex;flex-direction:column}
.card-tags{display:flex;gap:0.4rem;margin-bottom:0.7rem}
.ctag{font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;background:var(--green);color:#fff;padding:0.2rem 0.5rem}
.card-body h3{font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;margin-bottom:0.5rem;color:var(--text);line-height:1.3}
.card-body p{font-size:0.88rem;color:var(--muted);line-height:1.6;flex:1;margin-bottom:0.8rem}
.card-meta{font-size:0.75rem;color:var(--green);font-weight:700;letter-spacing:0.05em;text-transform:uppercase}
footer{background:#fff;border-top:1px solid var(--border);padding:2rem;text-align:center;font-size:0.82rem;color:var(--muted);margin-top:2rem}
@media(max-width:600px){.nav-links{display:none}.recipes-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<nav>
  <a href="/" class="nav-logo">Improv Oven</a>
  <ul class="nav-links">
    <li><a href="/recipes/">Recipes</a></li>
    <li><a href="/about/">About</a></li>
  </ul>
</nav>
<div class="page-header">
  <h1>All Recipes</h1>
  <p>Simple dishes with simple ingredients — ${recipes.length} recipes and counting.</p>
</div>
<div class="recipes-grid">${recipeCards}</div>
<footer>© ${new Date().getFullYear()} Improv Oven · <a href="/">Home</a></footer>
</body>
</html>`;

  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, html);
  console.log('Recipe index updated');
}

async function main() {
  try {
    // Generate recipe content
    const recipe = await generateRecipe();
    
    // Generate image
    const imageUrl = await generateImage(recipe.imagePrompt);
    
    // Create recipe page
    const date = new Date().toISOString().split('T')[0];
    const slug = slugify(recipe.title) + '-' + date;
    const recipeDir = path.join(process.cwd(), 'recipes', slug);
    
    fs.mkdirSync(recipeDir, { recursive: true });
    
    const html = buildRecipePage(recipe, imageUrl, slug, date);
    fs.writeFileSync(path.join(recipeDir, 'index.html'), html);
    console.log(`Recipe page created: recipes/${slug}/index.html`);

    // Update recipe index
    const recipesDataPath = path.join(process.cwd(), 'recipes-data.json');
    let recipes = [];
    if (fs.existsSync(recipesDataPath)) {
      recipes = JSON.parse(fs.readFileSync(recipesDataPath, 'utf8'));
    }
    recipes.unshift({
      slug,
      title: recipe.title,
      description: recipe.description,
      image: imageUrl,
      category: recipe.category,
      cuisine: recipe.cuisine,
      totalTime: recipe.totalTime,
      servings: recipe.servings,
      date
    });
    fs.writeFileSync(recipesDataPath, JSON.stringify(recipes, null, 2));
    
    await updateIndex(recipes);
    
    console.log('Done! Recipe published:', recipe.title);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
