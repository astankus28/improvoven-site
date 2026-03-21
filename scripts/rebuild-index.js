// rebuild-index.js
// Rebuilds recipes/index.html and sitemap.xml from recipes-data.json
// Runs automatically on every push via GitHub Actions

const fs = require('fs');
const path = require('path');

const recipesDataPath = path.join(process.cwd(), 'recipes-data.json');
let recipes = [];
if (fs.existsSync(recipesDataPath)) {
  recipes = JSON.parse(fs.readFileSync(recipesDataPath, 'utf8'));
}

// ── Rebuild recipe index ──────────────────────────────────────────────────────

const cards = recipes.slice(0, 200).map(r => `
    <a href="/recipes/${r.slug}/" class="recipe-card">
      <div class="card-img"><img src="${r.image}" alt="${r.title}" loading="lazy"></div>
      <div class="card-body">
        <div class="card-tags"><span class="ctag">${r.category}</span><span class="ctag">${r.cuisine}</span></div>
        <h3>${r.title}</h3>
        <p>${r.description.length > 120 ? r.description.slice(0, r.description.lastIndexOf(' ', 120)) + '...' : r.description}</p>
        <div class="card-meta">${r.totalTime} · Serves ${r.servings}</div>
      </div>
    </a>`).join('');

const indexHtml = `<!DOCTYPE html>
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
.search-wrap{max-width:1100px;margin:0 auto;padding:0 2rem 1rem}
.search-box{width:100%;padding:0.9rem 1.2rem;font-size:1rem;font-family:'Lato',sans-serif;border:2px solid var(--border);background:#fff;color:var(--text);outline:none;transition:border-color .2s}
.search-box:focus{border-color:var(--green)}
.search-box::placeholder{color:var(--muted)}
.no-results{grid-column:1/-1;text-align:center;color:var(--muted);padding:3rem;font-size:1.1rem}
.filter-wrap{max-width:1100px;margin:0 auto;padding:0 2rem 1.5rem;display:flex;gap:0.5rem;flex-wrap:wrap}
.filter-btn{font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;font-family:'Lato',sans-serif;padding:0.4rem 1rem;border:2px solid var(--border);background:#fff;color:var(--muted);cursor:pointer;transition:all .15s}
.filter-btn:hover{border-color:var(--green);color:var(--green)}
.filter-btn.active{background:var(--green);border-color:var(--green);color:#fff}
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
    <li><a href="/recipes/index.html">Recipes</a></li>
    <li><a href="/about/index.html">About</a></li>
  </ul>
</nav>
<div class="page-header">
  <h1>All Recipes</h1>
  <p>Simple dishes with simple ingredients — ${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} and counting.</p>
</div>
<div class="search-wrap">
  <input class="search-box" type="search" id="recipe-search" placeholder="Search recipes... try 'chicken', 'Latin', 'quick'" autocomplete="off">
</div>
<div class="filter-wrap" id="filter-wrap"></div>
<div class="recipes-grid">${cards || '<p style="grid-column:1/-1;text-align:center;color:#999;padding:3rem">First recipe coming soon!</p>'}</div>
<footer>© ${new Date().getFullYear()} Improv Oven · <a href="/">Home</a> · <a href="/recipes/index.html">All Recipes</a> · <a href="/privacy-policy/">Privacy Policy</a></footer>
<script>
const search = document.getElementById('recipe-search');
const grid = document.querySelector('.recipes-grid');
const filterWrap = document.getElementById('filter-wrap');
const cards = Array.from(grid.querySelectorAll('.recipe-card'));

// Build category filters from actual card data
const categories = ['All', ...new Set(cards.flatMap(c => 
  Array.from(c.querySelectorAll('.ctag')).map(t => t.textContent.trim())
))];

let activeFilter = 'All';

categories.forEach(cat => {
  const btn = document.createElement('button');
  btn.className = 'filter-btn' + (cat === 'All' ? ' active' : '');
  btn.textContent = cat;
  btn.addEventListener('click', () => {
    activeFilter = cat;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterCards();
  });
  filterWrap.appendChild(btn);
});

function filterCards() {
  const q = search.value.toLowerCase().trim();
  let visible = 0;
  cards.forEach(card => {
    const matchesSearch = !q || card.textContent.toLowerCase().includes(q);
    const matchesFilter = activeFilter === 'All' || 
      Array.from(card.querySelectorAll('.ctag')).some(t => t.textContent.trim() === activeFilter);
    const show = matchesSearch && matchesFilter;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const existing = grid.querySelector('.no-results');
  if (existing) existing.remove();
  if (visible === 0) {
    const msg = document.createElement('p');
    msg.className = 'no-results';
    msg.textContent = activeFilter !== 'All' 
      ? 'No ' + activeFilter + ' recipes yet — check back soon!'
      : 'No recipes found for "' + search.value + '" — try another search.';
    grid.appendChild(msg);
  }
}

search.addEventListener('input', filterCards);
</script>
</body>
</html>`;

const indexPath = path.join(process.cwd(), 'recipes', 'index.html');
fs.mkdirSync(path.dirname(indexPath), { recursive: true });
fs.writeFileSync(indexPath, indexHtml);
console.log(`✓ Recipe index rebuilt (${recipes.length} recipes)`);

// ── Rebuild sitemap ───────────────────────────────────────────────────────────

const baseUrl = 'https://www.improvoven.com';
const today = new Date().toISOString().split('T')[0];

const staticPages = [
  { url: '/', priority: '1.0', changefreq: 'daily' },
  { url: '/recipes/index.html', priority: '0.9', changefreq: 'daily' },
  { url: '/about/index.html', priority: '0.5', changefreq: 'monthly' },
  { url: '/privacy-policy/', priority: '0.3', changefreq: 'yearly' },
];

const recipeUrls = recipes.map(r => `  <url>
    <loc>${baseUrl}/recipes/${r.slug}/</loc>
    <lastmod>${r.date || today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

const staticUrls = staticPages.map(p => `  <url>
    <loc>${baseUrl}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${recipeUrls}
</urlset>`;

fs.writeFileSync(path.join(process.cwd(), 'sitemap.xml'), sitemap);
console.log(`✓ Sitemap rebuilt (${recipes.length + staticPages.length} URLs)`);
