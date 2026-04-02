const fs = require('fs');
const path = require('path');
const https = require('https');

const RECIPES_DIR = path.join(process.cwd(), 'recipes');

const recipes = [
  {
    slug: 'marinara-sauce-recipe',
    unsplashQuery: 'marinara-sauce-tomato'
  },
  {
    slug: 'how-to-make-guacamole-recipe',
    unsplashQuery: 'guacamole-avocado'
  },
  {
    slug: 'how-to-bake-flounder-fillets-recipe-with-tomato-salad',
    unsplashQuery: 'baked-fish-dinner'
  }
];

async function downloadFromUnsplash(query, filepath) {
  const url = `https://source.unsplash.com/1600x900/?${query}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, { maxRedirects: 5 }, (res) => {
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
  console.log(`📸 Adding stock images from Unsplash\n`);

  for (const recipe of recipes) {
    const imagePath = path.join(RECIPES_DIR, recipe.slug, 'images', 'hero.webp');
    const imageDir = path.dirname(imagePath);
    
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }

    try {
      console.log(`[${recipe.slug}] Downloading...`);
      await downloadFromUnsplash(recipe.unsplashQuery, imagePath);
      console.log(`  ✓ Saved\n`);
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}\n`);
    }
  }

  console.log(`✅ Done! Run: git add . && git commit -m "add stock images for 3 recipes" && git push`);
}

main();
