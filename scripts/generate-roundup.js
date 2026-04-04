// scripts/generate-roundup.js
// Generates a weekly round-up post from existing recipes
// Runs every Sunday via GitHub Actions

const fs = require('fs');
const path = require('path');
const https = require('https');
const { SITE_URL, GTAG_SNIPPET } = require('./site-config');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Round-up themes — Claude picks the best one based on available recipes
const ROUNDUP_THEMES = [
  { theme: 'Easy Weeknight Dinners', category: 'dinner', keywords: ['dinner', 'weeknight', 'easy', 'quick'] },
  { theme: 'Quick 30-Minute Meals', category: 'quick', keywords: ['quick', 'fast', '30 minute', '20 minute'] },
  { theme: 'Budget-Friendly Meals', category: 'budget', keywords: ['budget', 'cheap', 'affordable'] },
  { theme: 'Easy Breakfast Ideas', category: 'breakfast', keywords: ['breakfast', 'morning', 'eggs', 'pancakes'] },
  { theme: 'Latin & Miami-Inspired Recipes', category: 'latin', keywords: ['latin', 'cuban', 'mexican', 'venezuelan'] },
  { theme: 'Italian Recipes', category: 'italian', keywords: ['italian', 'pasta', 'pizza'] },
  { theme: 'Easy Chicken Recipes', category: 'any', keywords: ['chicken'] },
  { theme: 'Hearty Comfort Food', category: 'any', keywords: ['comfort', 'hearty', 'casserole', 'lasagna', 'mac'] },
  { theme: 'Easy Seafood Recipes', category: 'any', keywords: ['shrimp', 'salmon', 'fish', 'tuna', 'clam', 'ceviche', 'mahi'] },
  { theme: 'Easy Dessert Recipes', category: 'dessert', keywords: ['cookie', 'cake', 'chocolate', 'dessert', 'sweet'] },
  { theme: 'Meal Prep Ideas', category: 'any', keywords: ['meal prep', 'make ahead', 'batch'] },
  { theme: 'One-Pan Recipes', category: 'any', keywords: ['one pan', 'sheet pan', 'one pot', 'skillet'] },
];

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.content[0].text);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function buildRoundupPage(theme, recipes, intro, slug, date) {
  const year = new Date().getFullYear();
  const title = `${recipes.length} ${theme} — Improv Oven`;
  const description = intro.substring(0, 160);

  const recipeCards = recipes.map((r, i) => `
    <div class="roundup-item">
      <div class="roundup-num">${i + 1}</div>
      <div class="roundup-img">
        <a href="/recipes/${r.slug}/">
          <img src="/recipes/${r.slug}/images/hero.webp" alt="${r.title}" loading="lazy" onerror="this.src='/recipes/${r.slug}/images/hero.jpg'">
        </a>
      </div>
      <div class="roundup-info">
        <div class="roundup-meta">${r.cuisine || ''}${r.totalTime ? ' · ' + r.totalTime : ''}</div>
        <h2 class="roundup-title"><a href="/recipes/${r.slug}/">${r.title}</a></h2>
        <p class="roundup-desc">${r.description || ''}</p>
        <a href="/recipes/${r.slug}/" class="roundup-link">Get the recipe →</a>
      </div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${SITE_URL}/recipes/${recipes[0].slug}/images/hero.webp">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE_URL}/roundups/${slug}/">
<link rel="canonical" href="${SITE_URL}/roundups/${slug}/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}">
<meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}">
<meta name="twitter:image" content="${SITE_URL}/recipes/${recipes[0].slug}/images/hero.webp">
${GTAG_SNIPPET}
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${title}",
  "description": "${description}",
  "datePublished": "${date}",
  "url": "${SITE_URL}/roundups/${slug}/",
  "publisher": {"@type": "Organization", "name": "Improv Oven", "url": "${SITE_URL}"},
  "image": "${SITE_URL}/recipes/${recipes[0].slug}/images/hero.webp"
}
</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--green:#2d6a4f;--green-light:#52b788;--cream:#faf7f2;--text:#1a1a1a;--muted:#666;--border:#e8e0d0}
body{font-family:'Lato',sans-serif;background:var(--cream);color:var(--text);line-height:1.7}
a{color:var(--green);text-decoration:none}
a:hover{color:var(--green-light)}
nav{background:#fff;border-bottom:1px solid var(--border);padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.nav-logo{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;color:var(--green)}
.nav-logo span{font-style:italic;font-weight:400}
.nav-links{display:flex;gap:2rem;list-style:none}
.nav-links a{font-size:0.85rem;letter-spacing:0.05em;text-transform:uppercase;color:var(--muted);font-weight:700}
.nav-links a:hover{color:var(--green)}
.hero{background:#fff;border-bottom:1px solid var(--border);padding:4rem 2rem;text-align:center}
.hero-eyebrow{font-size:0.72rem;letter-spacing:0.25em;text-transform:uppercase;color:var(--green-light);font-weight:700;margin-bottom:1rem}
.hero h1{font-family:'Playfair Display',serif;font-size:clamp(2rem,5vw,3.5rem);font-weight:700;line-height:1.15;max-width:800px;margin:0 auto 1.5rem}
.hero-intro{font-size:1.05rem;color:var(--muted);max-width:680px;margin:0 auto;line-height:1.8}
.breadcrumb{padding:1rem 2rem;font-size:0.8rem;color:var(--muted);max-width:900px;margin:0 auto}
.breadcrumb a{color:var(--green)}
.wrap{max-width:900px;margin:0 auto;padding:3rem 2rem}
.roundup-item{display:grid;grid-template-columns:48px 1fr 2fr;gap:2rem;align-items:start;padding:2.5rem 0;border-bottom:1px solid var(--border)}
.roundup-item:last-child{border-bottom:none}
.roundup-num{font-family:'Playfair Display',serif;font-size:2.5rem;font-weight:700;color:var(--border);line-height:1}
.roundup-img{aspect-ratio:4/3;overflow:hidden;background:#f0ede6}
.roundup-img img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
.roundup-img:hover img{transform:scale(1.04)}
.roundup-meta{font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--green-light);font-weight:700;margin-bottom:0.5rem}
.roundup-title{font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;line-height:1.25;margin-bottom:0.75rem}
.roundup-title a{color:var(--text)}
.roundup-title a:hover{color:var(--green)}
.roundup-desc{font-size:0.9rem;color:var(--muted);line-height:1.7;margin-bottom:1rem}
.roundup-link{font-size:0.78rem;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;color:var(--green);border-bottom:1px solid var(--green);padding-bottom:0.1rem}
.roundup-link:hover{color:var(--green-light);border-color:var(--green-light)}
.signup-strip{background:var(--cream);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:4rem 2rem;text-align:center}
.signup-strip h2{font-family:'Playfair Display',serif;font-size:2rem;font-weight:700;margin-bottom:0.5rem}
.signup-strip p{color:var(--muted);max-width:480px;margin:0 auto 2rem}
.signup-form{display:flex;max-width:480px;margin:0 auto}
.signup-input{flex:1;padding:0.9rem 1.2rem;font-size:1rem;font-family:'Lato',sans-serif;border:2px solid var(--border);border-right:none;background:#fff;outline:none}
.signup-input:focus{border-color:var(--green)}
.signup-btn{padding:0.9rem 1.8rem;background:var(--green);color:#fff;font-size:0.82rem;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;border:2px solid var(--green);cursor:pointer;font-family:'Lato',sans-serif}
.signup-btn:hover{background:var(--green-light)}
footer{background:#fff;border-top:1px solid var(--border);padding:2.5rem 2rem;text-align:center;font-size:0.82rem;color:var(--muted)}
footer a{color:var(--green);font-weight:700}
@media(max-width:640px){
  .roundup-item{grid-template-columns:1fr;gap:1rem}
  .roundup-num{font-size:1.5rem}
  .nav-links{display:none}
  .signup-form{flex-direction:column}
  .signup-input{border-right:2px solid var(--border);border-bottom:none}
}
</style>
</head>
<body>
<nav>
  <a href="/" class="nav-logo">Improv <span>Oven</span></a>
  <ul class="nav-links">
    <li><a href="/recipes/">Recipes</a></li>
    <li><a href="/recipes/dinner/">Dinner</a></li>
    <li><a href="/recipes/breakfast/">Breakfast</a></li>
    <li><a href="/recipes/quick/">Quick</a></li>
    <li><a href="/about/">About</a></li>
  </ul>
</nav>
<div class="hero">
  <div class="hero-eyebrow">Improv Oven Round-Up</div>
  <h1>${recipes.length} ${theme}</h1>
  <p class="hero-intro">${intro}</p>
</div>
<div class="breadcrumb">
  <a href="/">Home</a> → <a href="/roundups/">Round-Ups</a> → ${theme}
</div>
<div class="wrap">
  ${recipeCards}
</div>
<div class="signup-strip">
  <h2>A New Recipe Every Day</h2>
  <p>Get simple, budget-friendly recipes delivered to your inbox.</p>
  <form action="https://improvoven.us5.list-manage.com/subscribe/post?u=5b750534650fb5ecc3b359db8&amp;id=4ef9909334&amp;f_id=000796e0f0" method="post" target="_blank">
    <div class="signup-form">
      <input class="signup-input" type="email" name="EMAIL" placeholder="Your email address" required>
      <button class="signup-btn" type="submit">Subscribe</button>
    </div>
    <div aria-hidden="true" style="position:absolute;left:-5000px">
      <input type="text" name="b_5b750534650fb5ecc3b359db8_4ef9909334" tabindex="-1" value="">
    </div>
  </form>
</div>
<footer>
  © ${year} Improv Oven · <a href="/recipes/">All Recipes</a> · <a href="/about/">About</a> · <a href="/privacy-policy/">Privacy Policy</a>
</footer>
</body>
</html>`;
}

async function main() {
  console.log('🗞️ Generating weekly round-up...');

  const recipes = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'recipes-data.json'), 'utf8'));
  const date = new Date().toISOString().split('T')[0];

  // Load used roundup slugs to avoid repeats
  const usedFile = path.join(process.cwd(), 'used-roundups.json');
  const usedSlugs = fs.existsSync(usedFile) ? JSON.parse(fs.readFileSync(usedFile, 'utf8')) : [];

  // Pick a theme — prefer ones not used recently
  const availableThemes = ROUNDUP_THEMES.filter(t => !usedSlugs.includes(slugify(t.theme)));
  const theme = availableThemes.length > 0
    ? availableThemes[Math.floor(Math.random() * availableThemes.length)]
    : ROUNDUP_THEMES[Math.floor(Math.random() * ROUNDUP_THEMES.length)];

  console.log(`📋 Theme: ${theme.theme}`);

  // Filter matching recipes
  let matching = recipes.filter(r => {
    const searchStr = (r.title + ' ' + r.description + ' ' + r.targetKeyword + ' ' + r.category + ' ' + r.cuisine).toLowerCase();
    return theme.keywords.some(k => searchStr.includes(k));
  });

  // If not enough matching, pull from category
  if (matching.length < 6) {
    const catMatch = recipes.filter(r =>
      r.category?.toLowerCase().includes(theme.category) ||
      r.cuisine?.toLowerCase().includes(theme.category)
    );
    matching = [...new Set([...matching, ...catMatch])];
  }

  // If still not enough, just use all recipes
  if (matching.length < 6) {
    matching = recipes;
  }

  // Shuffle and pick 8-10
  matching = matching.sort(() => Math.random() - 0.5).slice(0, 10);
  console.log(`📝 Selected ${matching.length} recipes`);

  // Generate intro with Claude
  const recipeList = matching.map(r => `- ${r.title}`).join('\n');
  const introPrompt = `Write a short, engaging 2-sentence intro paragraph for a recipe round-up blog post titled "${matching.length} ${theme.theme}". The recipes included are:\n${recipeList}\n\nThe blog is called Improv Oven — it's about quick, budget-friendly home cooking with Miami/Latin influence. Keep it warm, practical, and under 60 words. No fluff. Just output the paragraph, nothing else.`;

  const intro = await callClaude(introPrompt);
  console.log(`✓ Intro generated`);

  // Build slug and page
  const slug = `${slugify(theme.theme)}-${date}`;
  const html = buildRoundupPage(theme.theme, matching, intro.trim(), slug, date);

  // Save page
  const dir = path.join(process.cwd(), 'roundups', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`✓ Page saved: /roundups/${slug}/`);

  // Update used roundups
  usedSlugs.push(slugify(theme.theme));
  if (usedSlugs.length > ROUNDUP_THEMES.length) usedSlugs.shift(); // keep rolling window
  fs.writeFileSync(usedFile, JSON.stringify(usedSlugs, null, 2));

  // Add to recipes-data.json as a special entry
  const roundupEntry = {
    slug: `roundup-${slug}`,
    title: `${matching.length} ${theme.theme}`,
    description: intro.trim().substring(0, 200),
    image: `/recipes/${matching[0].slug}/images/hero.webp`,
    category: 'Round-Up',
    cuisine: 'Various',
    totalTime: '',
    servings: '',
    targetKeyword: theme.theme.toLowerCase(),
    date,
    isRoundup: true,
    roundupUrl: `/roundups/${slug}/`
  };

  recipes.unshift(roundupEntry);
  fs.writeFileSync(path.join(process.cwd(), 'recipes-data.json'), JSON.stringify(recipes, null, 2));
  console.log(`✓ Added to recipes-data.json`);

  console.log(`\n✅ Round-up complete: /roundups/${slug}/`);
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });
