// scripts/pinterest-post.js
// Auto-posts new recipes to Pinterest after generation
// Called from generate-recipe.js after a recipe is created

const https = require('https');
const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = process.env.PINTEREST_ACCESS_TOKEN;
const SITE_URL = 'https://www.improvoven.com';

// Board mapping — category/cuisine to board name
const BOARD_MAP = {
  breakfast: 'Easy Breakfast Recipes',
  dessert: 'Easy Dessert Recipes',
  italian: 'Italian Recipes',
  latin: 'Latin & Miami Recipes',
  mexican: 'Latin & Miami Recipes',
  cuban: 'Latin & Miami Recipes',
  venezuelan: 'Latin & Miami Recipes',
  argentine: 'Latin & Miami Recipes',
  'puerto rican': 'Latin & Miami Recipes',
  quick: '30-Minute Meals',
  budget: 'Budget Meals Under $10',
  default: 'Easy Weeknight Dinners',
};

function pinterestRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.pinterest.com',
      path: `/v5${endpoint}`,
      method,
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
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

async function getOrCreateBoard(boardName) {
  // Get existing boards
  const res = await pinterestRequest('GET', '/boards?page_size=100');
  if (res.status !== 200) {
    throw new Error(`Failed to get boards: ${JSON.stringify(res.data)}`);
  }

  const boards = res.data.items || [];
  const existing = boards.find(b => b.name.toLowerCase() === boardName.toLowerCase());
  if (existing) {
    console.log(`✓ Using existing board: ${boardName} (${existing.id})`);
    return existing.id;
  }

  // Create board
  console.log(`Creating new board: ${boardName}`);
  const createRes = await pinterestRequest('POST', '/boards', {
    name: boardName,
    description: `${boardName} from Improv Oven — simple, budget-friendly recipes.`,
    privacy: 'PUBLIC'
  });

  if (createRes.status !== 201) {
    throw new Error(`Failed to create board: ${JSON.stringify(createRes.data)}`);
  }

  console.log(`✓ Created board: ${boardName} (${createRes.data.id})`);
  return createRes.data.id;
}

function getBoardName(recipe) {
  const category = (recipe.category || '').toLowerCase();
  const cuisine = (recipe.cuisine || '').toLowerCase();
  const keyword = (recipe.targetKeyword || '').toLowerCase();
  const title = (recipe.title || '').toLowerCase();

  if (category === 'breakfast' || keyword.includes('breakfast')) return BOARD_MAP.breakfast;
  if (category === 'dessert' || keyword.includes('dessert') || keyword.includes('cookie') || keyword.includes('cake')) return BOARD_MAP.dessert;
  if (cuisine.includes('italian')) return BOARD_MAP.italian;
  if (['latin american', 'mexican', 'cuban', 'venezuelan', 'argentine', 'puerto rican', 'latin caribbean', 'cuban-american'].some(c => cuisine.includes(c))) return BOARD_MAP.latin;
  if (keyword.includes('budget') || keyword.includes('cheap') || keyword.includes('affordable')) return BOARD_MAP.budget;
  if (keyword.includes('30 minute') || keyword.includes('20 minute') || keyword.includes('15 minute') || keyword.includes('quick')) return BOARD_MAP.quick;
  return BOARD_MAP.default;
}

function generateDescription(recipe) {
  const desc = recipe.description || '';
  const time = recipe.totalTime ? `Ready in ${recipe.totalTime}.` : '';
  const cta = 'Full recipe at the link!';
  const tags = ['#ImprovOven', '#EasyRecipes', '#HomeCooking'].join(' ');
  
  return `${desc} ${time} ${cta} ${tags}`.trim().substring(0, 500);
}

async function postToPinterest(recipe, slug) {
  if (!ACCESS_TOKEN) {
    console.log('⚠ No Pinterest access token — skipping');
    return;
  }

  const boardName = getBoardName(recipe);
  const boardId = await getOrCreateBoard(boardName);

  const imageUrl = `${SITE_URL}/recipes/${slug}/images/hero.webp`;
  const recipeUrl = `${SITE_URL}/recipes/${slug}/`;
  const description = generateDescription(recipe);

  const pinData = {
    board_id: boardId,
    title: recipe.title,
    description,
    link: recipeUrl,
    media_source: {
      source_type: 'image_url',
      url: imageUrl
    }
  };

  console.log(`📌 Posting to Pinterest board: ${boardName}`);
  const res = await pinterestRequest('POST', '/pins', pinData);

  if (res.status === 201) {
    console.log(`✓ Pin created: ${res.data.id}`);
    console.log(`  Board: ${boardName}`);
    console.log(`  URL: ${recipeUrl}`);
    return res.data.id;
  } else {
    console.error(`❌ Failed to create pin: ${JSON.stringify(res.data)}`);
    throw new Error(`Pin creation failed with status ${res.status}`);
  }
}

// If run directly (for testing)
if (require.main === module) {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: node pinterest-post.js <recipe-slug>');
    process.exit(1);
  }
  
  const dataPath = path.join(process.cwd(), 'recipes-data.json');
  const recipes = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const recipe = recipes.find(r => r.slug === slug);
  
  if (!recipe) {
    console.error(`Recipe not found: ${slug}`);
    process.exit(1);
  }
  
  postToPinterest(recipe, slug)
    .then(() => console.log('Done!'))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { postToPinterest };
