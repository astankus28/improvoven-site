require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const RECIPES_DIR = path.join(process.cwd(), 'recipes');

const recipesToGenerate = [
  {
    slug: 'marinara-sauce-recipe',
    prompt: 'A vibrant bowl of fresh marinara sauce with basil leaves, professional food photography, warm lighting, shallow depth of field'
  },
  {
    slug: 'how-to-make-guacamole-recipe',
    prompt: 'Fresh guacamole in a bowl with avocado halves and lime, cilantro garnish, professional food photography, bright natural lighting'
  },
  {
    slug: 'how-to-bake-flounder-fillets-recipe-with-tomato-salad',
    prompt: 'Baked flounder fillet with fresh tomato salad, herbs, lemon, elegant plating, professional food photography, warm soft lighting'
  }
];

async function generateImage(prompt) {
  const body = JSON.stringify({
    version: 'f1769f27c7d1d4c0b3bdfb30379e9dd74a0d4dab3e5b57fc19e6c1e3f5e0e8b', // FLUX model
    input: { prompt }
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.replicate.com',
      path: '/v1/predictions',
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': body.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
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

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const file = fs.createWriteStream(filepath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log(`🎨 Generating ${recipesToGenerate.length} hero images\n`);

  for (const recipe of recipesToGenerate) {
    console.log(`[${recipe.slug}] Generating image...`);
    
    try {
      const prediction = await generateImage(recipe.prompt);
      
      if (prediction.error) {
        console.log(`  ✗ Error: ${prediction.error}`);
        continue;
      }

      const imageUrl = prediction.output?.[0];
      if (!imageUrl) {
        console.log(`  ✗ No image URL in response`);
        continue;
      }

      const imagePath = path.join(RECIPES_DIR, recipe.slug, 'images', 'hero.webp');
      const imageDir = path.dirname(imagePath);
      
      if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
      }

      await downloadImage(imageUrl, imagePath);
      console.log(`  ✓ Saved to ${imagePath}`);

    } catch (err) {
      console.log(`  ✗ Failed: ${err.message}`);
    }
  }

  console.log(`\n🚀 Now run: git add . && git commit -m "add missing hero images" && git push`);
}

main();
