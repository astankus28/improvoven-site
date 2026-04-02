require('dotenv').config();
const fs = require('fs');
const path = require('path');

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const RECIPES_DIR = path.join(process.cwd(), 'recipes');

const recipesToGenerate = [
  {
    slug: 'marinara-sauce-recipe',
    prompt: 'A vibrant bowl of fresh marinara sauce with basil leaves, professional food photography, warm lighting, shallow depth of field'
  },
  {
    slug: 'how-to-make-guacamole-recipe',
    prompt: 'Fresh guacamole in a bowl with avocado and lime, cilantro garnish, professional food photography, bright lighting'
  },
  {
    slug: 'how-to-bake-flounder-fillets-recipe-with-tomato-salad',
    prompt: 'Baked flounder fillet with fresh tomato salad, herbs, lemon, professional food photography, warm lighting'
  }
];

async function generateImage(prompt) {
  console.log(`  Sending to Replicate API...`);
  
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      version: 'db21e45d3f7023abc9571faf36591be0da5a27afb64f36132ccfd722797e1117', // Stable Diffusion 3
      input: { prompt, aspect_ratio: '16:9' }
    })
  });

  const data = await response.json();
  console.log(`  Response status: ${response.status}`);
  
  if (!response.ok) {
    console.log(`  Error:`, data.detail || data.title || data);
    return null;
  }

  return data;
}

async function waitForPrediction(predictionUrl) {
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes with 5s intervals
  
  while (attempts < maxAttempts) {
    const response = await fetch(predictionUrl, {
      headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` }
    });
    
    const data = await response.json();
    
    if (data.status === 'succeeded') {
      return data.output?.[0];
    }
    
    if (data.status === 'failed') {
      console.log(`  Prediction failed:`, data.error);
      return null;
    }
    
    console.log(`  Status: ${data.status}... (${attempts + 1}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }
  
  return null;
}

async function downloadImage(url, filepath) {
  console.log(`  Downloading image...`);
  const response = await fetch(url);
  const buffer = await response.buffer();
  fs.writeFileSync(filepath, buffer);
  console.log(`  ✓ Saved to ${path.basename(filepath)}`);
}

async function main() {
  console.log(`🎨 Generating ${recipesToGenerate.length} hero images with Stable Diffusion\n`);

  for (const recipe of recipesToGenerate) {
    console.log(`[${recipe.slug}]`);
    
    try {
      const prediction = await generateImage(recipe.prompt);
      
      if (!prediction) {
        console.log(`  ✗ Failed to start prediction\n`);
        continue;
      }

      console.log(`  Waiting for image generation...`);
      const imageUrl = await waitForPrediction(prediction.urls.get);
      
      if (!imageUrl) {
        console.log(`  ✗ Generation timed out\n`);
        continue;
      }

      const imagePath = path.join(RECIPES_DIR, recipe.slug, 'images', 'hero.webp');
      const imageDir = path.dirname(imagePath);
      
      if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
      }

      await downloadImage(imageUrl, imagePath);
      console.log('');

    } catch (err) {
      console.log(`  ✗ Error: ${err.message}\n`);
    }
  }

  console.log(`✅ Done! Run: git add . && git commit -m "add missing hero images" && git push`);
}

main();
