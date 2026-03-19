// run-once-add-photos.js
// Generates food photos and saves them directly into the repo as files
// Run from the root of improvoven-site:
// REPLICATE_API_TOKEN=your_token node run-once-add-photos.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

if (!REPLICATE_API_TOKEN) {
  console.error('❌ Missing REPLICATE_API_TOKEN');
  console.error('Run as: REPLICATE_API_TOKEN=your_token node run-once-add-photos.js');
  process.exit(1);
}

const LEGACY_RECIPES = [
  {
    slug: 'easy-homemade-chicken-wings-recipe',
    imagePrompt: 'Professional food photography of crispy homemade chicken wings on a wooden cutting board, some tossed in buffalo sauce, with ranch dipping sauce on the side, warm golden lighting, shallow depth of field, appetizing and vibrant'
  },
  {
    slug: 'bacon-egg-and-cheese-sandwich-on-a-croissant',
    imagePrompt: 'Professional food photography of a bacon egg and cheese breakfast sandwich on a golden flaky croissant, melted cheddar cheese visible, crispy bacon, scrambled eggs, on a white plate, warm morning light, shallow depth of field'
  },
  {
    slug: 'potato-lasagna-with-creamy-white-sauce',
    imagePrompt: 'Professional food photography of a slice of potato lasagna with creamy white sauce being served from a baking dish, golden bubbly cheese on top, layers of potato and meat visible, rustic wooden table, warm lighting'
  },
  {
    slug: 'venezuelan-teque-os-fried-cheese-sticks-recipe',
    imagePrompt: 'Professional food photography of Venezuelan tequenos fried cheese sticks on a plate, golden crispy dough exterior, one broken open showing melted cheese inside, with a dipping sauce, warm lighting, vibrant and appetizing'
  },
  {
    slug: 'easy-baked-salmon-recipe-2-ingredients',
    imagePrompt: 'Professional food photography of a perfectly baked salmon fillet on parchment paper, golden and flaky, glistening with Italian herb glaze, garnished with fresh herbs and lemon slices, warm golden lighting, shallow depth of field'
  },
  {
    slug: 'easy-egg-white-omelette-recipe',
    imagePrompt: 'Professional food photography of a fluffy egg white omelette on a white plate, folded with melted cheese and meat filling visible, garnished with fresh herbs, bright morning light, clean and appetizing presentation'
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
      res.on('end', () => { try { resolve(JSON.parse(chunks)); } catch(e) { reject(new Error('Parse error: ' + chunks.slice(0, 300))); } });
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
    if (result.status === 'failed') throw new Error('Image generation failed');
  }

  if (!result?.output?.[0]) throw new Error('No image output');

  // Save image as a local file in the repo
  const imgDir = path.join(process.cwd(), 'recipes', slug, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const imgPath = path.join(imgDir, 'hero.webp');
  await downloadBinary(result.output[0], imgPath);
  console.log(`\n  ✓ Saved: recipes/${slug}/images/hero.webp`);

  return '/recipes/' + slug + '/images/hero.webp';
}

function updateHtml(htmlPath, localImagePath, altText) {
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Add CSS if missing
  if (!html.includes('.recipe-hero{')) {
    html = html.replace('.back-link{',
      `.recipe-hero{width:100%;aspect-ratio:16/9;max-height:520px;overflow:hidden}\n.recipe-hero img{width:100%;height:100%;object-fit:cover}\n.back-link{`);
  }

  // Remove any existing broken hero div
  html = html.replace(/<div class="recipe-hero">[\s\S]*?<\/div>\n?/, '');

  // Insert hero after </nav>
  html = html.replace('</nav>\n<div class="recipe-wrap">',
    `</nav>\n<div class="recipe-hero">\n  <img src="${localImagePath}" alt="${altText}" fetchpriority="high">\n</div>\n<div class="recipe-wrap">`);

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
  console.log('🍳 Improv Oven — Legacy Recipe Photo Generator (Local Save)');
  console.log('=============================================================');
  console.log(`Generating and saving ${LEGACY_RECIPES.length} photos locally...\n`);

  for (const recipe of LEGACY_RECIPES) {
    console.log(`📸 ${recipe.slug}`);
    const htmlPath = path.join(process.cwd(), 'recipes', recipe.slug, 'index.html');
    if (!fs.existsSync(htmlPath)) { console.log(`  ⚠️  File not found — skipping\n`); continue; }

    try {
      const localPath = await generateAndSaveImage(recipe.imagePrompt, recipe.slug);
      updateHtml(htmlPath, localPath, recipe.slug.replace(/-/g, ' '));
      updateRecipesData(recipe.slug, localPath);
      console.log(`  ✓ Done\n`);
      await new Promise(r => setTimeout(r, 15000));
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}\n`);
    }
  }

  console.log('=============================================================');
  console.log('✅ All done! Images are saved permanently in the repo.');
  console.log('');
  console.log('Now in GitHub Desktop:');
  console.log('  Summary: "add permanent photos to legacy recipes"');
  console.log('  Commit → Push');
}

main();
