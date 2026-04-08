#!/usr/bin/env node
// scripts/delete-recipe.js
// Deletes a recipe by slug: removes folder, updates recipes-data.json, rebuilds index and sitemap
//
// Usage: node scripts/delete-recipe.js <slug>
// Example: node scripts/delete-recipe.js easy-dulce-de-leche-rice-krispie-treats-but-make-it-dinner-crispy-rice-bowls-wit-2026-04-07

const fs = require('fs');
const path = require('path');

const slug = process.argv[2];

if (!slug) {
  console.error('Usage: node scripts/delete-recipe.js <slug>');
  console.error('Example: node scripts/delete-recipe.js my-broken-recipe-2026-04-07');
  process.exit(1);
}

const recipesDataPath = path.join(process.cwd(), 'recipes-data.json');
const recipeDir = path.join(process.cwd(), 'recipes', slug);

// 1. Check if recipe exists in data
if (!fs.existsSync(recipesDataPath)) {
  console.error('❌ recipes-data.json not found');
  process.exit(1);
}

let recipes = JSON.parse(fs.readFileSync(recipesDataPath, 'utf8'));
const recipeIndex = recipes.findIndex(r => r.slug === slug);

if (recipeIndex === -1) {
  console.log(`⚠ Recipe "${slug}" not found in recipes-data.json`);
} else {
  const recipe = recipes[recipeIndex];
  console.log(`Found recipe: "${recipe.title}"`);
  recipes.splice(recipeIndex, 1);
  fs.writeFileSync(recipesDataPath, JSON.stringify(recipes, null, 2));
  console.log(`✓ Removed from recipes-data.json (${recipes.length} recipes remaining)`);
}

// 2. Delete recipe folder
if (fs.existsSync(recipeDir)) {
  fs.rmSync(recipeDir, { recursive: true, force: true });
  console.log(`✓ Deleted folder: recipes/${slug}/`);
} else {
  console.log(`⚠ Folder not found: recipes/${slug}/`);
}

// 3. Rebuild recipe index
console.log('\nRebuilding recipe index...');
const { SITE_URL, GTAG_SNIPPET } = require('./site-config');

function recipePageHref(r) {
  if (r.isRoundup && r.roundupUrl) return r.roundupUrl;
  return `/recipes/${r.slug}/`;
}

const indexPath = path.join(process.cwd(), 'recipes', 'index.html');
const cards = recipes.map(r => `
<a href="${recipePageHref(r)}" class="recipe-card">
  <img src="${r.image}" alt="${r.title}" loading="lazy">
  <div class="recipe-card-body">
    <h2>${r.title}</h2>
    <p class="recipe-meta">${r.totalTime || ''} · Serves ${r.servings || '?'}</p>
    <p>${(r.description || '').slice(0, 100)}...</p>
  </div>
</a>`).join('\n');

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Recipes - Improv Oven</title>
<meta name="description" content="Browse all Improv Oven recipes — easy, budget-friendly dishes with a Miami twist.">
<link rel="canonical" href="${SITE_URL}/recipes/">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
${GTAG_SNIPPET}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#faf9f7;color:#1a1a1a;line-height:1.6}
nav{background:#1a1a1a;padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center}
nav a{color:#fff;text-decoration:none;font-weight:600}
nav ul{list-style:none;display:flex;gap:1.5rem}
nav ul a{color:#ccc;font-weight:400}
nav ul a:hover{color:#fff}
.page-header{text-align:center;padding:3rem 1rem 2rem;background:linear-gradient(135deg,#52b788 0%,#2d6a4f 100%);color:#fff}
.page-header h1{font-size:2.5rem;margin-bottom:0.5rem}
.page-header p{opacity:0.9}
.search-wrap{max-width:600px;margin:1.5rem auto;padding:0 1rem}
.search-box{width:100%;padding:0.75rem 1rem;font-size:1rem;border:2px solid #ddd;border-radius:8px;outline:none}
.search-box:focus{border-color:#52b788}
.recipes-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.5rem;padding:1rem 2rem 3rem;max-width:1400px;margin:0 auto}
.recipe-card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);text-decoration:none;color:inherit;transition:transform 0.2s,box-shadow 0.2s}
.recipe-card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,0.12)}
.recipe-card img{width:100%;height:200px;object-fit:cover}
.recipe-card-body{padding:1rem}
.recipe-card h2{font-size:1.1rem;margin-bottom:0.25rem;color:#1a1a1a}
.recipe-meta{font-size:0.85rem;color:#52b788;margin-bottom:0.5rem}
.recipe-card p{font-size:0.9rem;color:#666}
footer{text-align:center;padding:2rem;background:#1a1a1a;color:#ccc;font-size:0.9rem}
footer a{color:#52b788}
.no-results{grid-column:1/-1;text-align:center;color:#999;padding:3rem}
</style>
</head>
<body>
<nav>
  <a href="/">Improv Oven</a>
  <ul>
    <li><a href="/recipes/">Recipes</a></li>
    <li><a href="/about/">About</a></li>
  </ul>
</nav>
<div class="page-header">
  <h1>All Recipes</h1>
  <p>Simple dishes with simple ingredients — ${recipes.length} recipe${recipes.length!==1?'s':''} and counting.</p>
</div>
<div class="search-wrap">
  <input class="search-box" type="search" id="recipe-search" placeholder="Search recipes... try 'chicken', 'Latin', 'quick'" autocomplete="off">
</div>
<div class="recipes-grid">${cards||'<p style="grid-column:1/-1;text-align:center;color:#999;padding:3rem">First recipe coming soon!</p>'}</div>
<footer>© ${new Date().getFullYear()} Improv Oven · <a href="/">Home</a> · <a href="/recipes/">All Recipes</a> · <a href="/affiliate-disclosure/">Affiliate Disclosure</a> · <a href="/privacy/">Privacy Policy</a></footer>
<script>
const search = document.getElementById('recipe-search');
const grid = document.querySelector('.recipes-grid');
const cards = Array.from(grid.querySelectorAll('.recipe-card'));
search.addEventListener('input', () => {
  const q = search.value.toLowerCase().trim();
  let visible = 0;
  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    const show = !q || text.includes(q);
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const existing = grid.querySelector('.no-results');
  if (existing) existing.remove();
  if (visible === 0) {
    const msg = document.createElement('p');
    msg.className = 'no-results';
    msg.textContent = 'No recipes found for "' + search.value + '" — try another search.';
    grid.appendChild(msg);
  }
});
</script>
</body>
</html>`;

fs.writeFileSync(indexPath, indexHtml);
console.log(`✓ Recipe index updated (${recipes.length} recipes)`);

// 4. Rebuild sitemap
console.log('Rebuilding sitemap...');
const today = new Date().toISOString().split('T')[0];
const staticPages = [
  { url: '/', priority: '1.0', changefreq: 'daily' },
  { url: '/recipes/', priority: '0.9', changefreq: 'daily' },
  { url: '/about/', priority: '0.5', changefreq: 'monthly' },
  { url: '/affiliate-disclosure/', priority: '0.3', changefreq: 'yearly' },
  { url: '/privacy/', priority: '0.3', changefreq: 'yearly' },
];

const staticUrls = staticPages.map(p => 
  `  <url>\n    <loc>${SITE_URL}${p.url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
).join('\n');

const recipeUrls = recipes.map(r =>
  `  <url>\n    <loc>${SITE_URL}/recipes/${r.slug}/</loc>\n    <lastmod>${r.date || today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`
).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticUrls}\n${recipeUrls}\n</urlset>`;
fs.writeFileSync(path.join(process.cwd(), 'sitemap.xml'), sitemap);
console.log(`✓ Sitemap updated`);

console.log(`\n✅ Recipe "${slug}" deleted successfully!`);
console.log('\nNext steps:');
console.log('  git add -A');
console.log('  git commit -m "Delete broken recipe: ' + slug + '"');
console.log('  git push');
