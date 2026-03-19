// fix-all-photos-unsplash.js
// Replaces ALL existing recipe photos with real Unsplash photos
// Run from root of improvoven-site:
// UNSPLASH_ACCESS_KEY=your_key node fix-all-photos-unsplash.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

if (!UNSPLASH_ACCESS_KEY) {
  console.error('❌ Missing UNSPLASH_ACCESS_KEY');
  console.error('Run as: UNSPLASH_ACCESS_KEY=your_key node fix-all-photos-unsplash.js');
  process.exit(1);
}

// All current recipes with good search terms
const RECIPES = [
  { slug: 'easy-homemade-chicken-wings-recipe', search: 'crispy chicken wings appetizer' },
  { slug: 'bacon-egg-and-cheese-sandwich-on-a-croissant', search: 'bacon egg cheese breakfast sandwich' },
  { slug: 'potato-lasagna-with-creamy-white-sauce', search: 'lasagna baked pasta dinner' },
  { slug: 'venezuelan-teque-os-fried-cheese-sticks-recipe', search: 'fried cheese sticks appetizer' },
  { slug: 'easy-baked-salmon-recipe-2-ingredients', search: 'baked salmon fillet dinner' },
  { slug: 'easy-egg-white-omelette-recipe', search: 'egg white omelette breakfast' },
  { slug: 'cheap-chicken-dinner-ideas-under-10-crispy-sofrito-rice-bowls-2026-03-19', search: 'chicken rice bowl dinner' },
  { slug: 'easy-lasagna-recipe-from-scratch-no-fancy-stuff-required-2026-03-19', search: 'homemade lasagna dinner' },
];

function httpsGetUnsplash(query) {
  return new Promise((resolve, reject) => {
    const searchQuery = encodeURIComponent(query);
    const options = {
      hostname: 'api.unsplash.com',
      path: `/search/photos?query=${searchQuery}&orientation=landscape&per_page=10&order_by=relevant`,
      method: 'GET',
      headers: {
        'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        'Accept-Version': 'v1'
      }
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

async function fetchAndSaveImage(search, slug) {
  const result = await httpsGetUnsplash(search);
  if (!result.results || result.results.length === 0) throw new Error('No photos found for: ' + search);

  const idx = Math.floor(Math.random() * Math.min(5, result.results.length));
  const photo = result.results[idx];
  const photoUrl = photo.urls.regular;
  console.log(`  ✓ Photo by ${photo.user.name} on Unsplash`);

  const imgDir = path.join(process.cwd(), 'recipes', slug, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const imgPath = path.join(imgDir, 'hero.jpg');
  await downloadBinary(photoUrl, imgPath);
  return '/recipes/' + slug + '/images/hero.jpg';
}

function updateHtml(htmlPath, localImagePath) {
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Add CSS if missing
  if (!html.includes('.recipe-hero{')) {
    html = html.replace('.back-link{',
      `.recipe-hero{width:100%;aspect-ratio:16/9;max-height:520px;overflow:hidden}\n.recipe-hero img{width:100%;height:100%;object-fit:cover}\n.back-link{`);
  }

  // Remove any existing hero div
  html = html.replace(/<div class="recipe-hero">[\s\S]*?<\/div>\n?/, '');

  // Insert fresh hero after </nav>
  html = html.replace('</nav>\n<div class="recipe-wrap">',
    `</nav>\n<div class="recipe-hero">\n  <img src="${localImagePath}" alt="Recipe photo" fetchpriority="high">\n</div>\n<div class="recipe-wrap">`);

  // Update og:image
  html = html.replace(/<meta property="og:image" content="[^"]*">/,
    `<meta property="og:image" content="https://www.improvoven.com${localImagePath}">`);

  fs.writeFileSync(htmlPath, html);
}

function updateRecipesData(slug, localImagePath) {
  const dataPath = path.join(process.cwd(), 'recipes-data.json');
  if (!fs.existsSync(dataPath)) return;
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const idx = data.findIndex(r => r.slug === slug);
  if (idx !== -1) {
    data[idx].image = localImagePath;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  }
}

async function main() {
  console.log('🍳 Replacing all recipe photos with Unsplash images...\n');

  for (const recipe of RECIPES) {
    console.log(`📸 ${recipe.slug}`);
    const htmlPath = path.join(process.cwd(), 'recipes', recipe.slug, 'index.html');

    if (!fs.existsSync(htmlPath)) {
      console.log(`  ⚠️  Not found — skipping\n`);
      continue;
    }

    try {
      const localPath = await fetchAndSaveImage(recipe.search, recipe.slug);
      updateHtml(htmlPath, localPath);
      updateRecipesData(recipe.slug, localPath);
      console.log(`  ✓ Done\n`);
      // Stay well under Unsplash's 50 requests/hour limit
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}\n`);
    }
  }

  console.log('✅ All done!');
  console.log('In GitHub Desktop: commit "replace photos with Unsplash" → Push');
}

main();
