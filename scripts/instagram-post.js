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
  // Using hardcoded Instagram Business Account ID
  const igAccountId = '17841400630237013';
  return {
    igAccountId,
    pageToken: INSTAGRAM_ACCESS_TOKEN
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

const FACEBOOK_PAGE_ID = '834239926633861';

async function postToFacebook(recipe, slug, pageToken) {
  const imageUrl = `${SITE_URL}/recipes/${slug}/images/hero.webp`;
  const recipeUrl = `${SITE_URL}/recipes/${slug}/`;
  const message = `${recipe.title}

${(recipe.description || '').substring(0, 200)}

Full recipe → ${recipeUrl}

#ImprovOven #EasyRecipes #HomeCooking`;

  console.log('📘 Posting to Facebook...');
  const res = await apiRequest('POST',
    `https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/feed?` +
    `link=${encodeURIComponent(recipeUrl)}&` +
    `message=${encodeURIComponent(message)}&` +
    `access_token=${pageToken}`
  );

  if (res.data.id) {
    console.log(`✅ Facebook post published: ${res.data.id}`);
  } else {
    console.log(`⚠ Facebook post failed: ${JSON.stringify(res.data)}`);
  }
}

async function postToInstagram(recipe, slug) {
  if (!INSTAGRAM_ACCESS_TOKEN) {
    console.log('⚠ No Instagram access token — skipping');
    return;
  }

  console.log('📸 Posting to Instagram + Facebook...');

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

  // Step 2: Publish to Instagram
  console.log('Publishing to Instagram...');
  const publishRes = await apiRequest('POST',
    `https://graph.facebook.com/v19.0/${igAccountId}/media_publish?` +
    `creation_id=${containerId}&` +
    `access_token=${pageToken}`
  );

  if (publishRes.data.id) {
    console.log(`✅ Instagram post published: ${publishRes.data.id}`);
  } else {
    console.log(`⚠ Instagram publish failed: ${JSON.stringify(publishRes.data)}`);
  }

// Step 3: Post to Facebook page
  await postToFacebook(recipe, slug, pageToken);
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
