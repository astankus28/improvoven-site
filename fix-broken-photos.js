// fix-broken-photos.js
// Fixes broken photos on auto-generated recipes
// Run: REPLICATE_API_TOKEN=your_token node fix-broken-photos.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

if (!REPLICATE_API_TOKEN) {
  console.error('❌ Missing REPLICATE_API_TOKEN');
  console.error('Run as: REPLICATE_API_TOKEN=your_token node fix-broken-photos.js');
  process.exit(1);
}

const BROKEN_RECIPES = [
  {
    slug: 'cheap-chicken-dinner-ideas-under-10-crispy-sofrito-rice-bowls-2026-03-19',
    imagePrompt: 'Professional food photography of crispy chicken sofrito rice bowls, golden crispy chicken pieces over fluffy rice with sofrito sauce, garnished with fresh herbs, warm golden lighting, shallow depth of field, rustic wooden table, vibrant and appetizing'
  },
  {
    slug: 'easy-lasagna-recipe-from-scratch-no-fancy-stuff-required-2026-03-19',
    imagePrompt: 'Professional food photography of a slice of homemade lasagna being served from a baking dish, golden bubbly cheese on top, layers of pasta meat and sauce visible, steam rising, rustic wooden table, warm golden lighting, appetizing and vibrant'
  }
];

function httpsPost(hostname, pathStr, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = { hostname, path: pathStr, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } };
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => { try { resolve(JSON.parse(chunks)); } catch(e) { reject(new Error('Parse error: ' + chunks.slice(0, 300))); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = { hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'GET', headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` } };
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => { try { resolve(JSON.parse(chunks)); } catch(e) { reject(new Error('Parse error')); } });
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

async function generateAndSaveImage(prompt, slug) {
  console.log('  Generating image...');
  const prediction = await httpsPost(
    'api.replicate.com',
    '/v1/models/black-forest-labs/flux-schnell/predictions',
    { 'Content-Type': 'application/json', 'Authorization': `Token ${REPLICATE_API_TOKEN}` },
    { input: { prompt, num_outputs: 1, aspect_ratio: "16:9", output_format: "webp", output_quality: 85 } }
  );

  if (!prediction.urls?.get) throw new Error('No polling URL: ' + JSON.stringify(prediction));

  let result;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    result = await httpsGetJson(prediction.urls.get);
    process.stdout.write(`  Status: ${result.status}   \r`);
    if (result.status === 'succeeded') break;
    if (result.status === 'failed') throw new Error('Image failed');
  }

  if (!result?.output?.[0]) throw new Error('No image output');

  const imgDir = path.join(process.cwd(), 'recipes', slug, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const imgPath = path.join(imgDir, 'hero.webp');
  await downloadBinary(result.output[0], imgPath);
  console.log(`\n  ✓ Saved: recipes/${slug}/images/hero.webp`);
  return '/recipes/' + slug + '/images/hero.webp';
}

function updateHtml(htmlPath, localImagePath) {
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Add CSS if missing
  if (!html.includes('.recipe-hero{')) {
    html = html.replace('.back-link{',
      `.recipe-hero{width:100%;aspect-ratio:16/9;max-height:520px;overflow:hidden}\n.recipe-hero img{width:100%;height:100%;object-fit:cover}\n.back-link{`);
  }

  // Remove any existing hero div (broken or otherwise)
  html = html.replace(/<div class="recipe-hero">[\s\S]*?<\/div>\n?/, '');

  // Insert fresh hero after </nav>
  html = html.replace('</nav>\n<div class="recipe-wrap">',
    `</nav>\n<div class="recipe-hero">\n  <img src="${localImagePath}" alt="Recipe photo" fetchpriority="high">\n</div>\n<div class="recipe-wrap">`);

  // Update og:image
  html = html.replace(/<meta property="og:image" content="[^"]*">/,
    `<meta property="og:image" content="https://www.improvoven.com${localImagePath}">`);

  fs.writeFileSync(htmlPath, html);
  console.log(`  ✓ HTML updated`);
}

function updateRecipesData(slug, localImagePath) {
  const dataPath = path.join(process.cwd(), 'recipes-data.json');
  if (!fs.existsSync(dataPath)) return;
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const idx = data.findIndex(r => r.slug === slug);
  if (idx !== -1) {
    data[idx].image = localImagePath;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log(`  ✓ recipes-data.json updated`);
  }
}

async function main() {
  console.log('🍳 Fixing broken recipe photos...\n');

  for (const recipe of BROKEN_RECIPES) {
    console.log(`📸 ${recipe.slug}`);
    const htmlPath = path.join(process.cwd(), 'recipes', recipe.slug, 'index.html');
    if (!fs.existsSync(htmlPath)) { console.log(`  ⚠️  Not found — skipping\n`); continue; }

    try {
      const localPath = await generateAndSaveImage(recipe.imagePrompt, recipe.slug);
      updateHtml(htmlPath, localPath);
      updateRecipesData(recipe.slug, localPath);
      console.log(`  ✓ Done\n`);
      await new Promise(r => setTimeout(r, 15000));
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}\n`);
    }
  }

  console.log('✅ All done! Commit and push in GitHub Desktop.');
}

main();
