// scripts/instagram-post.js
// Auto-posts new recipes to Instagram after generation
// Called from daily-recipe.yml after commit and Cloudflare deploy

const https = require('https');

const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const SITE_URL = 'https://www.improvoven.com';

function apiRequest(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };

    const req = https.request(options, res => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(response) });
        } catch (e) {
          resolve({ status: res.statusCode, data: response });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getInstagramAccountId() {
  const url = `https://graph.facebook.com/v19.0/me/accounts?access_token=${INSTAGRAM_ACCESS_TOKEN}`;
  const res = await apiRequest('GET', url);
  if (!res.data.data || res.data.data.length === 0) {
    throw new Error('No Facebook pages found');
  }
  
  // Get Instagram account connected to the page
  const pageId = res.data.data[0].id;
  const pageToken = res.data.data[0].access_token;
  
  const igRes = await apiRequest('GET', 
    `https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${pageToken}`
  );
  
  if (!igRes.data.instagram_business_account) {
    throw new Error('No Instagram business account connected to this page');
  }
  
  return {
    igAccountId: igRes.data.instagram_business_account.id,
    pageToken
  };
}

function buildCaption(recipe, slug) {
  const recipeUrl = `${SITE_URL}/recipes/${slug}/`;
  const desc = (recipe.description || '').substring(0, 150);
  
  // Build hashtags based on category/cuisine
  const hashtags = [
    '#ImprovOven',
    '#EasyRecipes',
    '#HomeCooking',
    '#RecipeOfTheDay',
    '#FoodBlog',
  ];
  
  const cuisine = (recipe.cuisine || '').toLowerCase();
  const category = (recipe.category || '').toLowerCase();
  
  if (cuisine.includes('cuban') || cuisine.includes('latin') || cuisine.includes('caribbean')) {
    hashtags.push('#LatinFood', '#CubanFood', '#MiamiFood');
  } else if (cuisine.includes('italian')) {
    hashtags.push('#ItalianFood', '#ItalianRecipes');
  } else if (cuisine.includes('mexican')) {
    hashtags.push('#MexicanFood', '#MexicanRecipes');
  } else if (cuisine.includes('argentine')) {
    hashtags.push('#ArgentineFood', '#SouthAmericanFood');
  }
  
  if (category === 'breakfast') hashtags.push('#Breakfast', '#BreakfastRecipes');
  if (category === 'dessert') hashtags.push('#Dessert', '#DessertRecipes', '#Sweets');
  if (recipe.cost === 'Budget') hashtags.push('#BudgetMeals', '#CheapEats');
  
  return `${recipe.title}\n\n${desc}\n\nFull recipe at improvoven.com 🔗 (link in bio)\n\n${hashtags.join(' ')}`;
}

async function postToInstagram(recipe, slug) {
  if (!INSTAGRAM_ACCESS_TOKEN) {
    console.log('⚠ No Instagram access token — skipping');
    return;
  }

  console.log('📸 Posting to Instagram...');

  // Get Instagram account ID
  const { igAccountId, pageToken } = await getInstagramAccountId();
  console.log(`✓ Instagram account ID: ${igAccountId}`);

  const imageUrl = `${SITE_URL}/recipes/${slug}/images/hero.webp`;
  const caption = buildCaption(recipe, slug);

  // Step 1: Create media container
  console.log('Creating media container...');
  const containerRes = await apiRequest('POST',
    `https://graph.facebook.com/v19.0/${igAccountId}/media?` +
    `image_url=${encodeURIComponent(imageUrl)}&` +
    `caption=${encodeURIComponent(caption)}&` +
    `access_token=${pageToken}`
  );

  if (!containerRes.data.id) {
    throw new Error(`Failed to create container: ${JSON.stringify(containerRes.data)}`);
  }

  const containerId = containerRes.data.id;
  console.log(`✓ Container created: ${containerId}`);

  // Wait for container to be ready
  await new Promise(r => setTimeout(r, 5000));

  // Step 2: Publish the container
  console.log('Publishing post...');
  const publishRes = await apiRequest('POST',
    `https://graph.facebook.com/v19.0/${igAccountId}/media_publish?` +
    `creation_id=${containerId}&` +
    `access_token=${pageToken}`
  );

  if (publishRes.data.id) {
    console.log(`✅ Instagram post published: ${publishRes.data.id}`);
    console.log(`   Recipe: ${recipe.title}`);
  } else {
    throw new Error(`Failed to publish: ${JSON.stringify(publishRes.data)}`);
  }
}

// If run directly
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const slug = process.argv[2];
  
  if (!slug) {
    console.error('Usage: node instagram-post.js <recipe-slug>');
    process.exit(1);
  }
  
  const recipes = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'recipes-data.json'), 'utf8'));
  const recipe = recipes.find(r => r.slug === slug) || recipes[0];
  
  postToInstagram(recipe, recipe.slug)
    .then(() => console.log('Done!'))
    .catch(e => { console.error('❌', e.message); process.exit(1); });
}

module.exports = { postToInstagram };
