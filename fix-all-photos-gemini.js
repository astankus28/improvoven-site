// fix-all-photos-gemini.js
// Replaces ALL existing recipe photos with Gemini Imagen generated photos
// Run from root of improvoven-site:
// GEMINI_API_KEY=your_key node fix-all-photos-gemini.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY');
  console.error('Run as: GEMINI_API_KEY=your_key node fix-all-photos-gemini.js');
  process.exit(1);
}

const RECIPES = [
  {
    slug: 'easy-homemade-chicken-wings-recipe',
    prompt: 'Professional food photography of crispy homemade chicken wings on a wooden cutting board, some tossed in buffalo sauce, with ranch dipping sauce on the side, warm golden lighting, shallow depth of field, appetizing and vibrant'
  },
  {
    slug: 'bacon-egg-and-cheese-sandwich-on-a-croissant',
    prompt: 'Professional food photography of a bacon egg and cheese breakfast sandwich on a golden flaky croissant, melted cheddar cheese visible, crispy bacon, scrambled eggs, on a white plate, warm morning light, shallow depth of field'
  },
  {
    slug: 'potato-lasagna-with-creamy-white-sauce',
    prompt: 'Professional food photography of a slice of potato lasagna with creamy white sauce being served from a baking dish, golden bubbly cheese on top, layers of potato and meat visible, rustic wooden table, warm lighting'
  },
  {
    slug: 'venezuelan-teque-os-fried-cheese-sticks-recipe',
    prompt: 'Professional food photography of fried cheese sticks on a plate, golden crispy exterior, one broken open showing melted cheese inside, with a dipping sauce, warm lighting, vibrant and appetizing'
  },
  {
    slug: 'easy-baked-salmon-recipe-2-ingredients',
    prompt: 'Professional food photography of a perfectly baked salmon fillet on parchment paper, golden and flaky, glistening with herb glaze, garnished with fresh herbs and lemon slices, warm golden lighting, shallow depth of field'
  },
  {
    slug: 'easy-egg-white-omelette-recipe',
    prompt: 'Professional food photography of a fluffy egg white omelette on a white plate, folded with melted cheese and meat filling visible, garnished with fresh herbs, bright morning light, clean and appetizing presentation'
  },
  {
    slug: 'cheap-chicken-dinner-ideas-under-10-crispy-sofrito-rice-bowls-2026-03-19',
    prompt: 'Professional food photography of crispy chicken sofrito rice bowls, golden crispy chicken pieces over fluffy white rice with vibrant sofrito sauce, garnished with fresh cilantro, warm golden lighting, shallow depth of field'
  },
  {
    slug: 'easy-lasagna-recipe-from-scratch-no-fancy-stuff-required-2026-03-19',
    prompt: 'Professional food photography of a slice of homemade lasagna being served from a baking dish, golden bubbly cheese on top, layers of pasta meat and sauce visible, steam rising, rustic wooden table, warm golden lighting'
  }
];

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

async function generateAndSaveImage(prompt, slug) {
  const response = await httpsPost(
    'generativelanguage.googleapis.com',
    `/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_API_KEY}`,
    { 'Content-Type': 'application/json' },
    {
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '16:9',
        safetyFilterLevel: 'block_few',
        personGeneration: 'dont_allow'
      }
    }
  );

  if (!response.predictions || !response.predictions[0]) {
    throw new Error('No image from Gemini: ' + JSON.stringify(response).slice(0, 300));
  }

  const base64Image = response.predictions[0].bytesBase64Encoded;
  const imgDir = path.join(process.cwd(), 'recipes', slug, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const imgPath = path.join(imgDir, 'hero.jpg');
  fs.writeFileSync(imgPath, Buffer.from(base64Image, 'base64'));
  console.log(`  ✓ Image saved`);
  return '/recipes/' + slug + '/images/hero.jpg';
}

function updateHtml(htmlPath, localImagePath) {
  let html = fs.readFileSync(htmlPath, 'utf8');

  if (!html.includes('.recipe-hero{')) {
    html = html.replace('.back-link{',
      `.recipe-hero{width:100%;aspect-ratio:16/9;max-height:520px;overflow:hidden}\n.recipe-hero img{width:100%;height:100%;object-fit:cover}\n.back-link{`);
  }

  html = html.replace(/<div class="recipe-hero">[\s\S]*?<\/div>\n?/, '');
  html = html.replace('</nav>\n<div class="recipe-wrap">',
    `</nav>\n<div class="recipe-hero">\n  <img src="${localImagePath}" alt="Recipe photo" fetchpriority="high">\n</div>\n<div class="recipe-wrap">`);
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
  console.log('🍳 Replacing all recipe photos with Gemini Imagen...\n');

  for (const recipe of RECIPES) {
    console.log(`📸 ${recipe.slug}`);
    const htmlPath = path.join(process.cwd(), 'recipes', recipe.slug, 'index.html');

    if (!fs.existsSync(htmlPath)) {
      console.log(`  ⚠️  Not found — skipping\n`);
      continue;
    }

    try {
      const localPath = await generateAndSaveImage(recipe.prompt, recipe.slug);
      updateHtml(htmlPath, localPath);
      updateRecipesData(recipe.slug, localPath);
      console.log(`  ✓ Done\n`);
      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}\n`);
    }
  }

  console.log('✅ All done!');
  console.log('In GitHub Desktop: commit "replace photos with Gemini Imagen" → Push');
}

main();
