// batch-generate-images.js
// Generates Replicate images for all 46 migrated legacy recipes
// Run from root of improvoven-site:
// REPLICATE_API_TOKEN=your_token node batch-generate-images.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
if (!REPLICATE_API_TOKEN) { console.error('❌ Missing REPLICATE_API_TOKEN'); process.exit(1); }

const RECIPES = [\n  { slug: 'apple-walnut-salad-with-creamy-lemon-dressing', prompt: "Professional food photography of Apple Walnut Salad with Creamy Lemon Dressing, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'arancini-italian-rice-balls-recipe', prompt: "Professional food photography of Arancini Italian Rice Balls Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'avocado-on-toast-recipe', prompt: "Professional food photography of Avocado On Toast Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'bacon-egg-cheese-breakfast-wrap', prompt: "Professional food photography of Bacon, Egg, &amp; Cheese Breakfast Wrap, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'baked-chicken-and-rice-casserole', prompt: "Professional food photography of Oven Baked Chicken and Rice Casserole, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'baked-rigatoni-recipe', prompt: "Professional food photography of Baked Rigatoni Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'belgian-waffles', prompt: "Professional food photography of Belgian Waffles Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'best-bloody-mary-drink-mix-and-cocktail-recipe', prompt: "Professional food photography of Best Bloody Mary Drink Mix And Cocktail Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'best-fried-baked-eggplant-parmesan-recipe', prompt: "Professional food photography of How to Make The Best Eggplant Parmesan Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'best-homemade-pepperoni-pizza-dough-sauce', prompt: "Professional food photography of How to Make a Pizza: Best Homemade Pepperoni Pizza + Sauce, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'creamy-spinach-and-italian-sausage-pasta-recipe', prompt: "Professional food photography of Creamy Spinach and Italian Sausage Pasta Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'crispy-roasted-baked-balsamic-brussels-sprouts-recipe', prompt: "Professional food photography of Crispy Roasted Balsamic Brussels Sprouts Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'curry-chicken-sandwich', prompt: "Professional food photography of Curry Chicken Sandwich, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'double-swiss-cheeseburger-with-fried-egg-on-everything-bagel', prompt: "Professional food photography of Double Swiss Cheeseburger with Fried Egg on Everything Bagel, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'easy-banana-nut-bread-recipe', prompt: "Professional food photography of Easy Banana Nut Bread Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'easy-cheesy-chicken-alfredo', prompt: "Professional food photography of Easy-Cheesy Chicken Alfredo, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'easy-cilantro-lime-shrimp-tacos-recipe', prompt: "Professional food photography of Easy Cilantro Lime Shrimp Tacos Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'easy-crepe-recipe-sweet-blueberry-stuffed-crepes', prompt: "Professional food photography of Easy Crepe Recipe: Sweet Blueberry Stuffed Crepes, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'easy-fried-chicken-tenders', prompt: "Professional food photography of Easy Fried Chicken Tenders, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'easy-mac-and-cheese', prompt: "Professional food photography of Easy Mac and Cheese, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'easy-shepherds-pie-recipe', prompt: "Professional food photography of Easy Shepherds Pie Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'easy-shrimp-and-cheese-grits-recipe', prompt: "Professional food photography of Easy Shrimp and Cheese Grits Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'easy-smothered-and-fried-pork-chops-and-rice-recipe', prompt: "Professional food photography of Easy Smothered And Fried Pork Chops And Rice Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'easy-stuffed-red-peppers-italian-sausage-rice', prompt: "Professional food photography of Easy Stuffed Red Peppers with Italian Sausage and Rice, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'eggs-in-a-basket-simple-3-ingredient-egg-cups', prompt: "Professional food photography of Eggs in a Basket - Simple 3 Ingredient Egg Cups, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'fried-chicken-sandwich-recipe', prompt: "Professional food photography of Fried Chicken Sandwich Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'grape-and-hummus-tuna-salad-sandwich', prompt: "Professional food photography of Grape and Hummus Tuna Salad Sandwich, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'grilled-chili-lime-corn-on-the-cob', prompt: "Professional food photography of Grilled Chili Lime Corn On The Cob, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'grilled-steak-fajitas-recipe', prompt: "Professional food photography of Grilled Steak Fajitas Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'ground-chicken-meatballs-recipe', prompt: "Professional food photography of Ground Chicken Meatballs Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'handful-spinach-eggs-over-easy-recipe', prompt: "Professional food photography of Handful of Spinach and Eggs Over Easy, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'how-to-bake-flounder-fillets-recipe-with-tomato-salad', prompt: "Professional food photography of How To Bake Flounder Fillets Recipe with Tomato Salad, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'how-to-make-cheese-omelette', prompt: "Professional food photography of How to Make an Easy Cheese Omelette, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'how-to-make-creamy-garlic-mashed-potatoes-recipe', prompt: "Professional food photography of Creamy Garlic Mashed Potatoes Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'how-to-make-easy-buttermilk-biscuits-sage-sausage-gravy', prompt: "Professional food photography of How to Make Easy Buttermilk Biscuits and Sage Sausage Gravy, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'how-to-make-guacamole-recipe', prompt: "Professional food photography of How to Make Guacamole Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'how-to-make-pizza-dough-from-scratch-home', prompt: "Professional food photography of How to Make Homemade Pizza Dough from Scratch, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'marinara-sauce-recipe', prompt: "Professional food photography of Marinara Sauce Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'milk-chocolate-covered-clusters-with-marshmallows-raisins-and-golden-grahams', prompt: "Professional food photography of Milk Chocolate Covered Clusters with Marshmallows, Raisins and Golden Grahams, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'oven-baked-bbq-mahi-mahi', prompt: "Professional food photography of Oven Baked BBQ Mahi-Mahi, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'peruvian-tilapia-ceviche', prompt: "Professional food photography of Peruvian Tilapia Ceviche, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'quick-and-easy-hot-cocoa-with-mashmallows-caramel-and-chocolate-sauce', prompt: "Professional food photography of Quick and Easy Hot Cocoa with Mashmallows, Caramel and Chocolate Sauce, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'sausage-peppers-and-onions', prompt: "Professional food photography of Sausage, Peppers, and Onions, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'slow-cooker-pulled-pork-sandwich', prompt: "Professional food photography of Slow Cooker Pulled Pork Sandwich with Purple Slaw, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'snickerdoodle-cookies', prompt: "Professional food photography of Easy Snickerdoodles Cookie Recipe, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n  { slug: 'the-best-chocolate-chip-cookies-from-scratch', prompt: "Professional food photography of The Best Chocolate Chip Cookies from Scratch, warm golden lighting, shallow depth of field, rustic wooden table, beautifully plated, vibrant and appetizing, restaurant quality" },\n];

function httpsPost(hostname, pathStr, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname, path: pathStr, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let chunks = ''; res.on('data', d => chunks += d);
      res.on('end', () => { try { resolve(JSON.parse(chunks)); } catch(e) { reject(new Error('Parse error')); } });
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'GET', headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` } }, (res) => {
      let chunks = ''; res.on('data', d => chunks += d);
      res.on('end', () => { try { resolve(JSON.parse(chunks)); } catch(e) { reject(new Error('Parse error')); } });
    });
    req.on('error', reject); req.end();
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
        res.on('end', () => { fs.writeFileSync(destPath, Buffer.concat(chunks)); resolve(); });
      });
      req.on('error', reject); req.end();
    };
    follow(url);
  });
}

async function generateImage(recipe) {
  const prediction = await httpsPost(
    'api.replicate.com',
    '/v1/models/black-forest-labs/flux-schnell/predictions',
    { 'Content-Type': 'application/json', 'Authorization': `Token ${REPLICATE_API_TOKEN}` },
    { input: { prompt: recipe.prompt, num_outputs: 1, aspect_ratio: '16:9', output_format: 'webp', output_quality: 85 } }
  );
  if (!prediction.urls?.get) throw new Error('No polling URL');
  let result;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    result = await httpsGetJson(prediction.urls.get);
    process.stdout.write(`  ${result.status}   \r`);
    if (result.status === 'succeeded') break;
    if (result.status === 'failed') throw new Error('Failed');
  }
  if (!result?.output?.[0]) throw new Error('No output');
  const imgDir = path.join(process.cwd(), 'recipes', recipe.slug, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  await downloadBinary(result.output[0], path.join(imgDir, 'hero.webp'));
}

async function main() {
  const args = process.argv.slice(2);
  const startFrom = args[0] ? parseInt(args[0]) : 0;
  const recipes = RECIPES.slice(startFrom);
  
  console.log(`🍳 Generating images for ${recipes.length} recipes (starting from #${startFrom})...\n`);
  let done = 0, failed = 0;

  for (const recipe of recipes) {
    const imgPath = path.join(process.cwd(), 'recipes', recipe.slug, 'images', 'hero.webp');
    if (fs.existsSync(imgPath)) {
      console.log(`⏭  Skipping ${recipe.slug} (already has image)`);
      continue;
    }
    process.stdout.write(`📸 ${recipe.slug}\n`);
    try {
      await generateImage(recipe);
      console.log(`\n  ✓ Done (${++done}/${recipes.length})`);
      await new Promise(r => setTimeout(r, 8000));
    } catch(err) {
      console.error(`\n  ❌ ${err.message} — skipping`);
      failed++;
    }
  }
  console.log(`\n✅ Complete: ${done} generated, ${failed} failed`);
  console.log('Commit and push in GitHub Desktop.');
}
main();
