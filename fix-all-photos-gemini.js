// fix-all-photos-gemini.js
// Uses Gemini 2.5 Flash native image generation (FREE - 500/day)
// Run: GEMINI_API_KEY=your_key node fix-all-photos-gemini.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) { console.error('❌ Missing GEMINI_API_KEY'); process.exit(1); }

const RECIPES = [
  { slug: 'easy-homemade-chicken-wings-recipe', prompt: 'Professional food photography of crispy homemade chicken wings on a wooden cutting board, some tossed in buffalo sauce, ranch dipping sauce on the side, warm golden lighting, shallow depth of field, appetizing' },
  { slug: 'bacon-egg-and-cheese-sandwich-on-a-croissant', prompt: 'Professional food photography of bacon egg and cheese breakfast sandwich on a golden flaky croissant, melted cheddar, crispy bacon, scrambled eggs, white plate, warm morning light' },
  { slug: 'potato-lasagna-with-creamy-white-sauce', prompt: 'Professional food photography of potato lasagna with creamy white sauce in a baking dish, golden bubbly cheese on top, rustic wooden table, warm lighting' },
  { slug: 'venezuelan-teque-os-fried-cheese-sticks-recipe', prompt: 'Professional food photography of fried cheese sticks on a plate, golden crispy exterior, one broken open showing melted cheese inside, dipping sauce, warm lighting' },
  { slug: 'easy-baked-salmon-recipe-2-ingredients', prompt: 'Professional food photography of perfectly baked salmon fillet, golden and flaky, herb glaze, fresh herbs and lemon slices, warm golden lighting, shallow depth of field' },
  { slug: 'easy-egg-white-omelette-recipe', prompt: 'Professional food photography of fluffy egg white omelette on white plate, folded with melted cheese filling, fresh herbs garnish, bright morning light' },
  { slug: 'cheap-chicken-dinner-ideas-under-10-crispy-sofrito-rice-bowls-2026-03-19', prompt: 'Professional food photography of crispy chicken sofrito rice bowl, golden chicken over white rice with vibrant sauce, fresh cilantro garnish, warm golden lighting' },
  { slug: 'easy-lasagna-recipe-from-scratch-no-fancy-stuff-required-2026-03-19', prompt: 'Professional food photography of homemade lasagna slice on a plate, golden bubbly cheese, layers of pasta and meat sauce visible, rustic wooden table, warm lighting' }
];

function httpsPost(hostname, pathStr, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname, path: pathStr, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        try { resolve(JSON.parse(raw.toString())); }
        catch(e) { reject(new Error('Parse error: ' + raw.toString().slice(0, 300))); }
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
    `/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
    { 'Content-Type': 'application/json' },
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    }
  );

  // Find image part in response
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

  if (!imagePart) {
    throw new Error('No image in response: ' + JSON.stringify(response).slice(0, 300));
  }

  const ext = imagePart.inlineData.mimeType.includes('png') ? 'png' : 'jpg';
  const imgDir = path.join(process.cwd(), 'recipes', slug, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const imgPath = path.join(imgDir, `hero.${ext}`);
  fs.writeFileSync(imgPath, Buffer.from(imagePart.inlineData.data, 'base64'));
  console.log(`  ✓ Image saved: hero.${ext}`);
  return `/recipes/${slug}/images/hero.${ext}`;
}

function updateHtml(htmlPath, localImagePath) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  if (!html.includes('.recipe-hero{')) {
    html = html.replace('.back-link{', `.recipe-hero{width:100%;aspect-ratio:16/9;max-height:520px;overflow:hidden}\n.recipe-hero img{width:100%;height:100%;object-fit:cover}\n.back-link{`);
  }
  html = html.replace(/<div class="recipe-hero">[\s\S]*?<\/div>\n?/, '');
  html = html.replace('</nav>\n<div class="recipe-wrap">', `</nav>\n<div class="recipe-hero">\n  <img src="${localImagePath}" alt="Recipe photo" fetchpriority="high">\n</div>\n<div class="recipe-wrap">`);
  html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="https://www.improvoven.com${localImagePath}">`);
  fs.writeFileSync(htmlPath, html);
  console.log(`  ✓ HTML updated`);
}

function updateRecipesData(slug, localImagePath) {
  const dataPath = path.join(process.cwd(), 'recipes-data.json');
  if (!fs.existsSync(dataPath)) return;
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const idx = data.findIndex(r => r.slug === slug);
  if (idx !== -1) { data[idx].image = localImagePath; fs.writeFileSync(dataPath, JSON.stringify(data, null, 2)); console.log(`  ✓ Data updated`); }
}

async function main() {
  console.log('🍳 Generating recipe photos with Gemini 2.5 Flash (free)...\n');
  for (const recipe of RECIPES) {
    console.log(`📸 ${recipe.slug}`);
    const htmlPath = path.join(process.cwd(), 'recipes', recipe.slug, 'index.html');
    if (!fs.existsSync(htmlPath)) { console.log(`  ⚠️  Not found\n`); continue; }
    try {
      const localPath = await generateAndSaveImage(recipe.prompt, recipe.slug);
      updateHtml(htmlPath, localPath);
      updateRecipesData(recipe.slug, localPath);
      console.log(`  ✓ Done\n`);
      await new Promise(r => setTimeout(r, 35000));
    } catch (err) { console.error(`  ❌ ${err.message}\n`); }
  }
  console.log('✅ Done! Commit "replace photos with Gemini" → Push in GitHub Desktop.');
}
main();
