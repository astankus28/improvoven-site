// run-once-add-photos.js
// Run this once from the root of your improvoven-site folder:
// node run-once-add-photos.js
//
// Requires REPLICATE_API_TOKEN in your environment:
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

// Image prompts for each legacy recipe
const LEGACY_RECIPES = [
  {
    slug: 'easy-homemade-chicken-wings-recipe',
    imagePrompt: 'Professional food photography of crispy homemade chicken wings on a wooden cutting board, some tossed in buffalo sauce, some plain, with ranch dipping sauce on the side, warm golden lighting, shallow depth of field, appetizing and vibrant'
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

async function generateImage(prompt) {
  const prediction = await httpsPost(
    'api.replicate.com',
    '/v1/models/black-forest-labs/flux-schnell/predictions',
    {
      'Content-Type': 'application/json',
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
    },
    {
      input: {
        prompt,
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

  let result;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    result = await httpsGet(prediction.urls.get);
    process.stdout.write(`  Status: ${result.status}\r`);
    if (result.status === 'succeeded') break;
    if (result.status === 'failed') throw new Error('Image failed');
  }

  if (!result?.output?.[0]) throw new Error('No image output');
  return result.output[0];
}

function updateHtmlWithImage(htmlPath, imageUrl, recipeTitle) {
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Check if there's already a hero image section
  if (html.includes('class="recipe-hero"')) {
    // Replace existing broken image
    html = html.replace(
      /<div class="recipe-hero">[\s\S]*?<\/div>/,
      `<div class="recipe-hero">\n  <img src="${imageUrl}" alt="${recipeTitle}" fetchpriority="high">\n</div>`
    );
  } else {
    // Insert hero image after <body> and nav
    html = html.replace(
      '</nav>\n<div class="recipe-wrap">',
      `</nav>\n<div class="recipe-hero">\n  <img src="${imageUrl}" alt="${recipeTitle}" fetchpriority="high">\n</div>\n<div class="recipe-wrap">`
    );
  }

  // Add recipe-hero CSS if not present
  if (!html.includes('.recipe-hero')) {
    html = html.replace(
      '.back-link{',
      `.recipe-hero{width:100%;aspect-ratio:16/9;max-height:520px;overflow:hidden;margin-bottom:0}
.recipe-hero img{width:100%;height:100%;object-fit:cover}
.back-link{`
    );
  }

  // Update og:image meta tag
  html = html.replace(
    /<meta property="og:image" content="[^"]*">/,
    `<meta property="og:image" content="${imageUrl}">`
  );

  fs.writeFileSync(htmlPath, html);
}

function updateRecipesData(slug, imageUrl) {
  const dataPath = path.join(process.cwd(), 'recipes-data.json');
  if (!fs.existsSync(dataPath)) {
    console.log('  ⚠️  recipes-data.json not found — skipping data update');
    return;
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const idx = data.findIndex(r => r.slug === slug);
  if (idx !== -1) {
    data[idx].image = imageUrl;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log('  ✓ Updated recipes-data.json');
  }
}

async function main() {
  console.log('🍳 Improv Oven — Legacy Recipe Photo Generator');
  console.log('================================================');
  console.log(`Generating photos for ${LEGACY_RECIPES.length} recipes...\n`);

  for (const recipe of LEGACY_RECIPES) {
    console.log(`📸 ${recipe.slug}`);

    const htmlPath = path.join(process.cwd(), 'recipes', recipe.slug, 'index.html');

    if (!fs.existsSync(htmlPath)) {
      console.log(`  ⚠️  Not found: recipes/${recipe.slug}/index.html — skipping\n`);
      continue;
    }

    try {
      const imageUrl = await generateImage(recipe.imagePrompt);
      console.log(`  ✓ Image: ${imageUrl.slice(0, 60)}...`);

      updateHtmlWithImage(htmlPath, imageUrl, recipe.slug.replace(/-/g, ' '));
      console.log(`  ✓ HTML updated`);

      updateRecipesData(recipe.slug, imageUrl);
      console.log(`  ✓ Done\n`);

      // Small pause between requests
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`  ❌ Error: ${err.message}\n`);
    }
  }

  console.log('================================================');
  console.log('✅ All done! Now commit and push in GitHub Desktop.');
  console.log('   Summary → "add photos to legacy recipes" → Commit → Push');
}

main();
