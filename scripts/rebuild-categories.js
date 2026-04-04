// scripts/rebuild-categories.js
// Rebuilds all category pages from recipes-data.json
// Runs automatically via GitHub Actions on every push

const fs = require('fs');
const path = require('path');
const { SITE_URL, GTAG_SNIPPET } = require('./site-config');

const recipes = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'recipes-data.json'), 'utf8'));
const year = new Date().getFullYear();

const CATEGORY_PAGES = [
  {
    slug: 'dinner',
    title: 'Easy Dinner Recipes',
    description: 'Quick and easy dinner recipes for busy weeknights. From pasta to chicken to budget-friendly meals — find your next favorite dinner. Curated by Improv Oven with Miami and Latin pantry-friendly ideas.',
    h1: 'Easy Dinner Recipes',
    filter: r => ['entree'].includes(r.category?.toLowerCase()) || r.category?.toLowerCase().includes('dinner'),
    keywords: 'easy dinner recipes, quick weeknight dinners, simple dinner ideas',
    emoji: '🍽',
    color: '#2d6a4f',
  },
  {
    slug: 'breakfast',
    title: 'Easy Breakfast Recipes',
    description: 'Simple and delicious breakfast recipes to start your day right. From eggs to pancakes to quick morning meals. Easy, budget-conscious ideas from Improv Oven.',
    h1: 'Easy Breakfast Recipes',
    filter: r => r.category?.toLowerCase() === 'breakfast' || r.category?.toLowerCase().includes('breakfast'),
    keywords: 'easy breakfast recipes, quick breakfast ideas, simple morning meals',
    emoji: '🍳',
    color: '#e07a2f',
  },
  {
    slug: 'italian',
    title: 'Italian Recipes',
    description: 'Classic Italian recipes made simple. Pasta, pizza, arancini and more — authentic Italian flavors for home cooks. Step-by-step dinners from Improv Oven.',
    h1: 'Italian Recipes',
    filter: r => r.cuisine?.toLowerCase().includes('italian'),
    keywords: 'italian recipes, easy pasta recipes, homemade italian food',
    emoji: '🍝',
    color: '#c0392b',
  },
  {
    slug: 'latin',
    title: 'Latin Recipes',
    description: 'Bold and flavorful Latin recipes inspired by Miami and South American cuisine. Empanadas, ceviche, rice and beans and more. Home-cook friendly recipes from Improv Oven.',
    h1: 'Latin & Miami-Inspired Recipes',
    filter: r => ['latin', 'mexican', 'cuban', 'puerto rican', 'venezuelan', 'argentine', 'peruvian'].some(x => r.cuisine?.toLowerCase().includes(x)),
    keywords: 'latin recipes, Cuban recipes, Miami food, South American recipes',
    emoji: '🌶',
    color: '#7b2d8b',
  },
  {
    slug: 'budget',
    title: 'Budget Meal Recipes',
    description: "Delicious meals that won't break the bank. Easy budget recipes under $10 per serving for families and meal preppers. Real weeknight cooking from Improv Oven.",
    h1: 'Budget-Friendly Recipes',
    filter: r => ['budget', 'cheap', 'affordable', 'under $'].some(x => (r.targetKeyword || '' + r.description || '').toLowerCase().includes(x)),
    keywords: 'budget meals, cheap dinner ideas, affordable recipes, meals under $10',
    emoji: '💰',
    color: '#1a6b3c',
  },
  {
    slug: 'quick',
    title: '30-Minute Recipes',
    description: 'Fast and easy recipes ready in 30 minutes or less. Perfect for busy weeknights when you need dinner on the table fast. Quick pantry dinners from Improv Oven.',
    h1: 'Quick 30-Minute Recipes',
    filter: r => ['30 minute', '20 minute', '15 minute', 'quick', 'fast'].some(x => (r.targetKeyword || '' + r.title || '' + r.description || '').toLowerCase().includes(x)),
    keywords: '30 minute meals, quick easy recipes, fast dinner ideas',
    emoji: '⚡',
    color: '#2471a3',
  },
  {
    slug: 'dessert',
    title: 'Dessert Recipes',
    description: 'Easy and delicious dessert recipes. Cookies, cakes, chocolate treats and more sweet recipes for every occasion. Simple sweets from Improv Oven.',
    h1: 'Dessert Recipes',
    filter: r => r.category?.toLowerCase() === 'dessert' || r.category?.toLowerCase().includes('dessert'),
    keywords: 'easy dessert recipes, simple sweet treats, homemade cookies cakes',
    emoji: '🍰',
    color: '#c0392b',
  },
];

function makeCard(r) {
  const desc = (r.description || '').length > 100 ? r.description.substring(0, 100) + '...' : (r.description || '');
  return `
    <article class="recipe-card">
      <a href="/recipes/${r.slug}/">
        <div class="card-img">
          <img src="/recipes/${r.slug}/images/hero.webp" alt="${r.title}" loading="lazy" onerror="this.src='/recipes/${r.slug}/images/hero.jpg'">
        </div>
        <div class="card-body">
          <div class="card-meta">${r.cuisine || ''}${r.totalTime ? ' · ' + r.totalTime : ''}</div>
          <h2 class="card-title">${r.title}</h2>
          <p class="card-desc">${desc}</p>
        </div>
      </a>
    </article>`;
}

function makePage(cat, matching) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${cat.title} — Improv Oven</title>
<meta name="description" content="${cat.description}">
<meta name="keywords" content="${cat.keywords}">
<meta property="og:title" content="${cat.title} — Improv Oven">
<meta property="og:description" content="${cat.description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}/recipes/${cat.slug}/">
<meta property="og:image" content="${SITE_URL}/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<link rel="canonical" href="${SITE_URL}/recipes/${cat.slug}/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${cat.title.replace(/"/g, '&quot;')} — Improv Oven">
<meta name="twitter:description" content="${cat.description.replace(/"/g, '&quot;')}">
<meta name="twitter:image" content="${SITE_URL}/og-image.jpg">
${GTAG_SNIPPET}
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "${cat.title}",
  "description": "${cat.description}",
  "url": "${SITE_URL}/recipes/${cat.slug}/",
  "publisher": {"@type": "Organization", "name": "Improv Oven", "url": "${SITE_URL}"}
}
</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--green:#2d6a4f;--accent:${cat.color};--white:#fff;--bg:#f8f7f4;--text:#1a1a1a;--gray:#666;--border:#e8e4dc}
body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
a{color:inherit;text-decoration:none}
nav{background:#fff;border-bottom:1px solid var(--border);padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.nav-logo{font-family:'Playfair Display',serif;font-size:1.3rem;color:var(--green)}
.nav-links{display:flex;gap:1.5rem;list-style:none}
.nav-links a{font-size:0.85rem;color:var(--gray);transition:color 0.2s}
.nav-links a:hover{color:var(--green)}
.hero{background:var(--accent);color:#fff;padding:4rem 2rem;text-align:center}
.hero-label{font-size:0.7rem;letter-spacing:0.25em;text-transform:uppercase;opacity:0.7;margin-bottom:0.75rem}
.hero h1{font-family:'Playfair Display',serif;font-size:clamp(2rem,5vw,3.5rem);font-weight:700;margin-bottom:1rem;line-height:1.1}
.hero p{font-size:1rem;opacity:0.85;max-width:600px;margin:0 auto 1.5rem}
.hero-count{font-size:0.8rem;opacity:0.6;letter-spacing:0.1em}
.breadcrumb{padding:1rem 2rem;font-size:0.8rem;color:var(--gray);max-width:1400px;margin:0 auto}
.breadcrumb a{color:var(--green)}
.breadcrumb a:hover{text-decoration:underline}
.grid-wrap{max-width:1400px;margin:0 auto;padding:2rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem}
.recipe-card{background:#fff;border-radius:12px;overflow:hidden;border:1px solid var(--border);transition:transform 0.2s,box-shadow 0.2s}
.recipe-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.1)}
.card-img{aspect-ratio:16/9;overflow:hidden;background:#f0ede6}
.card-img img{width:100%;height:100%;object-fit:cover;transition:transform 0.3s}
.recipe-card:hover .card-img img{transform:scale(1.04)}
.card-body{padding:1rem}
.card-meta{font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent);margin-bottom:0.4rem;font-weight:500}
.card-title{font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;line-height:1.3;margin-bottom:0.4rem}
.card-desc{font-size:0.82rem;color:var(--gray);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.other-cats{background:#fff;border-top:1px solid var(--border);padding:3rem 2rem;text-align:center}
.other-cats h2{font-family:'Playfair Display',serif;font-size:1.5rem;margin-bottom:1.5rem}
.cat-pills{display:flex;flex-wrap:wrap;gap:0.75rem;justify-content:center}
.cat-pill{padding:0.5rem 1.2rem;border-radius:100px;border:1px solid var(--border);font-size:0.82rem;color:var(--gray);transition:all 0.2s}
.cat-pill:hover{background:var(--green);color:#fff;border-color:var(--green)}
footer{background:#1a1a1a;color:rgba(255,255,255,0.4);text-align:center;padding:2rem;font-size:0.8rem}
footer a{color:rgba(255,255,255,0.5)}
@media(max-width:600px){nav{padding:0.75rem 1rem}.nav-links{display:none}.hero{padding:2.5rem 1rem}.grid-wrap{padding:1rem}.grid{grid-template-columns:1fr 1fr;gap:1rem}}
</style>
</head>
<body>
<nav>
  <a href="/" class="nav-logo">Improv Oven</a>
  <ul class="nav-links">
    <li><a href="/recipes/">All Recipes</a></li>
    <li><a href="/recipes/dinner/">Dinner</a></li>
    <li><a href="/recipes/breakfast/">Breakfast</a></li>
    <li><a href="/recipes/quick/">Quick Meals</a></li>
    <li><a href="/recipes/latin/">Latin</a></li>
    <li><a href="/recipes/dessert/">Desserts</a></li>
  </ul>
</nav>
<div class="hero">
  <div class="hero-label">Improv Oven</div>
  <h1>${cat.emoji} ${cat.h1}</h1>
  <p>${cat.description}</p>
  <div class="hero-count">${matching.length} recipes</div>
</div>
<div class="breadcrumb">
  <a href="/">Home</a> → <a href="/recipes/">Recipes</a> → ${cat.title}
</div>
<div class="grid-wrap">
  <div class="grid">
    ${matching.map(makeCard).join('')}
  </div>
</div>
<div class="other-cats">
  <h2>Browse More Categories</h2>
  <div class="cat-pills">
    <a href="/recipes/dinner/" class="cat-pill">🍽 Dinner</a>
    <a href="/recipes/breakfast/" class="cat-pill">🍳 Breakfast</a>
    <a href="/recipes/quick/" class="cat-pill">⚡ 30-Minute Meals</a>
    <a href="/recipes/italian/" class="cat-pill">🍝 Italian</a>
    <a href="/recipes/latin/" class="cat-pill">🌶 Latin</a>
    <a href="/recipes/budget/" class="cat-pill">💰 Budget Meals</a>
    <a href="/recipes/dessert/" class="cat-pill">🍰 Desserts</a>
    <a href="/recipes/" class="cat-pill">📖 All Recipes</a>
  </div>
</div>
<footer>
  <p>© ${year} Improv Oven · <a href="/affiliate-disclosure/">Affiliate Disclosure</a> · <a href="/privacy/">Privacy Policy</a></p>
</footer>
</body>
</html>`;
}

// Build all pages
let total = 0;
for (const cat of CATEGORY_PAGES) {
  const matching = recipes.filter(cat.filter);
  const dir = path.join(process.cwd(), 'recipes', cat.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), makePage(cat, matching));
  console.log(`✓ /recipes/${cat.slug}/ — ${matching.length} recipes`);
  total++;
}

console.log(`\n✅ Built ${total} category pages`);
