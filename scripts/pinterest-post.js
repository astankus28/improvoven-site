// scripts/pinterest-post.js
// Auto-posts new recipes to Pinterest after generation
// Called from generate-recipe.js after a recipe is created
//
// UPGRADES:
// - Posts multiple pin variations (different titles/descriptions)
// - Uses vertical Pinterest image (2:3) instead of hero (16:9)
// - Generates keyword-rich hashtags from recipe data
// - Adds seasonal/holiday hashtags when applicable
// - Staggers pin posting to avoid spam detection

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
  caribbean: 'Latin & Miami Recipes',
  quick: '30-Minute Meals',
  budget: 'Budget Meals Under $10',
  default: 'Easy Weeknight Dinners',
};

// Secondary boards for cross-posting (pin variation 2)
const SECONDARY_BOARD_MAP = {
  breakfast: 'Budget Meals Under $10',
  dessert: 'Easy Weeknight Dinners',
  italian: 'Easy Weeknight Dinners',
  latin: 'Easy Weeknight Dinners',
  quick: 'Budget Meals Under $10',
  budget: '30-Minute Meals',
  default: 'Budget Meals Under $10',
};

// ============================================================
// HASHTAG GENERATION
// Builds keyword-rich hashtags from recipe data + seasonal context
// ============================================================

const CUISINE_HASHTAGS = {
  italian: ['#ItalianFood', '#ItalianRecipes', '#PastaLovers'],
  mexican: ['#MexicanFood', '#MexicanRecipes', '#ComidaMexicana'],
  cuban: ['#CubanFood', '#CubanRecipes', '#ComidaCubana', '#MiamiFood'],
  venezuelan: ['#VenezuelanFood', '#ComidaVenezolana', '#Arepas'],
  argentine: ['#ArgentineFood', '#ComidaArgentina', '#Asado'],
  'puerto rican': ['#PuertoRicanFood', '#ComidaBoricua', '#Boricua'],
  'latin american': ['#LatinFood', '#ComidaLatina', '#SaboresLatinos'],
  'latin caribbean': ['#CaribbeanFood', '#LatinFood', '#MiamiFood'],
  american: ['#AmericanFood', '#ComfortFood', '#Homestyle'],
  'cuban-american': ['#CubanFood', '#MiamiFood', '#CubanAmerican'],
};

const CATEGORY_HASHTAGS = {
  breakfast: ['#BreakfastIdeas', '#BreakfastRecipe', '#BrunchIdeas', '#MorningMeals'],
  dessert: ['#DessertRecipe', '#SweetTreats', '#Baking', '#DessertLovers'],
  entree: ['#DinnerIdeas', '#DinnerRecipes', '#WeeknightDinner', '#MainCourse'],
  appetizer: ['#AppetizerRecipes', '#PartyFood', '#Snacks'],
  soup: ['#SoupRecipes', '#ComfortFood', '#SoupSeason'],
  salad: ['#SaladRecipes', '#HealthyEating', '#FreshFood'],
  side: ['#SideDishes', '#SideRecipes'],
  sauce: ['#HomemadeSauce', '#SauceRecipe', '#FromScratch'],
};

const SEASONAL_HASHTAGS = {
  cinco_de_mayo: ['#CincodeMayo', '#CincodeMayoFood', '#CincodeMayoRecipes', '#FiestaMexicana'],
  easter: ['#EasterRecipes', '#EasterDinner', '#EasterBrunch', '#SpringRecipes'],
  thanksgiving: ['#ThanksgivingRecipes', '#ThanksgivingDinner', '#HolidayRecipes'],
  christmas: ['#ChristmasRecipes', '#HolidayBaking', '#ChristmasDinner', '#HolidayRecipes'],
  halloween: ['#HalloweenRecipes', '#HalloweenFood', '#SpookyTreats'],
  fourth_of_july: ['#4thofJuly', '#FourthofJulyFood', '#BBQRecipes', '#SummerCookout'],
  memorial_day: ['#MemorialDay', '#BBQRecipes', '#SummerCookout', '#GrillingRecipes'],
  labor_day: ['#LaborDay', '#BBQRecipes', '#SummerRecipes'],
  valentines: ['#ValentinesDay', '#RomanticDinner', '#DateNight'],
  mothers_day: ['#MothersDay', '#BrunchIdeas', '#MothersDayBrunch'],
  fathers_day: ['#FathersDay', '#GrillingRecipes', '#BBQRecipes'],
  st_patricks: ['#StPatricksDay', '#IrishFood', '#IrishRecipes'],
  new_year: ['#NewYearsEve', '#PartyFood', '#NewYearsRecipes'],
};

function getCurrentSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Check active holiday windows (must match generate-recipe.js)
  if ((month === 12 && day >= 28) || (month === 1 && day <= 3)) return 'new_year';
  if (month === 2 && day >= 7 && day <= 14) return 'valentines';
  if (month === 3 && day >= 10 && day <= 17) return 'st_patricks';
  if (month === 4 && day >= 14) return 'cinco_de_mayo'; // Extended window
  if (month === 5 && day <= 5) return 'cinco_de_mayo';
  if (month === 5 && day >= 4 && day <= 11) return 'mothers_day';
  if (month === 5 && day >= 18 && day <= 26) return 'memorial_day';
  if (month === 6 && day >= 8 && day <= 15) return 'fathers_day';
  if ((month === 6 && day >= 20) || (month === 7 && day <= 4)) return 'fourth_of_july';
  if ((month === 8 && day >= 29) || (month === 9 && day <= 7)) return 'labor_day';
  if (month === 10 && day >= 15) return 'halloween';
  if (month === 11 && day <= 27) return 'thanksgiving';
  if (month === 12 && day >= 15 && day <= 25) return 'christmas';

  // Easter is dynamic — approximate check (late March to mid-April)
  if ((month === 3 && day >= 20) || (month === 4 && day <= 15)) return 'easter';

  return null;
}

function extractKeywordsFromTitle(title) {
  // Extract meaningful words for hashtags
  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'easy', 'simple', 'homemade', 'recipe', 'best', 'perfect', 'delicious', 'amazing', 'quick']);
  
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Create hashtags from significant words
  return words.slice(0, 3).map(w => `#${w.charAt(0).toUpperCase() + w.slice(1)}`);
}

function generateHashtags(recipe) {
  const tags = new Set();
  
  // Always include brand
  tags.add('#ImprovOven');
  
  // Cuisine-based hashtags
  const cuisine = (recipe.cuisine || '').toLowerCase();
  for (const [key, hashtags] of Object.entries(CUISINE_HASHTAGS)) {
    if (cuisine.includes(key)) {
      hashtags.slice(0, 2).forEach(t => tags.add(t));
      break;
    }
  }
  
  // Category-based hashtags
  const category = (recipe.category || '').toLowerCase();
  if (CATEGORY_HASHTAGS[category]) {
    CATEGORY_HASHTAGS[category].slice(0, 2).forEach(t => tags.add(t));
  }
  
  // Seasonal hashtags
  const season = getCurrentSeason();
  if (season && SEASONAL_HASHTAGS[season]) {
    SEASONAL_HASHTAGS[season].slice(0, 2).forEach(t => tags.add(t));
  }
  
  // Keyword-based hashtags from title
  extractKeywordsFromTitle(recipe.title).forEach(t => tags.add(t));
  
  // Time-based hashtags
  const totalMins = parseInt((recipe.totalTime || '').replace(/\D/g, '')) || 0;
  if (totalMins > 0 && totalMins <= 30) {
    tags.add('#30MinuteMeals');
    tags.add('#QuickDinner');
  } else if (totalMins > 0 && totalMins <= 20) {
    tags.add('#20MinuteMeals');
  }
  
  // Budget hashtags
  const keyword = (recipe.targetKeyword || '').toLowerCase();
  if (keyword.includes('budget') || keyword.includes('cheap') || keyword.includes('affordable')) {
    tags.add('#BudgetMeals');
    tags.add('#CheapEats');
  }
  
  // Generic high-volume tags
  tags.add('#EasyRecipes');
  tags.add('#HomeCooking');
  tags.add('#FoodBlogger');
  
  // Return up to 15 hashtags (Pinterest's soft limit for readability)
  return Array.from(tags).slice(0, 15);
}

// ============================================================
// PIN VARIATIONS
// Creates multiple pin versions with different titles/angles
// ============================================================

function generatePinVariations(recipe) {
  const baseTitle = recipe.title;
  const time = recipe.totalTime || '';
  const cuisine = recipe.cuisine || '';
  const category = (recipe.category || '').toLowerCase();
  
  const variations = [];
  
  // Variation 1: Original title (primary pin)
  variations.push({
    title: baseTitle,
    descriptionStyle: 'standard',
  });
  
  // Variation 2: Time-focused title
  if (time) {
    const mins = time.replace(/\D/g, '');
    if (mins && parseInt(mins) <= 30) {
      variations.push({
        title: `${mins}-Minute ${baseTitle.replace(/easy |simple |homemade /gi, '')}`,
        descriptionStyle: 'time_focused',
      });
    }
  }
  
  // Variation 3: Cuisine/occasion angle
  const season = getCurrentSeason();
  if (season === 'cinco_de_mayo' && cuisine.toLowerCase().includes('mexican')) {
    variations.push({
      title: `Cinco de Mayo ${baseTitle.replace(/mexican |easy |simple /gi, '')}`,
      descriptionStyle: 'seasonal',
    });
  } else if (category === 'dessert') {
    variations.push({
      title: `Must-Try ${baseTitle}`,
      descriptionStyle: 'enthusiastic',
    });
  } else if (category === 'breakfast') {
    variations.push({
      title: `Wake Up to This ${baseTitle.replace(/easy |simple |breakfast /gi, '')}`,
      descriptionStyle: 'enthusiastic',
    });
  }
  
  // Return max 2 variations to avoid spam
  return variations.slice(0, 2);
}

function buildScannablePinTitle(recipe) {
  const raw = String((recipe && recipe.title) || '').trim();
  if (!raw) return 'Easy Weeknight Recipe';
  const compact = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(easy|simple|homemade|authentic|budget|recipe)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = compact.split(' ').filter(Boolean);
  const core = (words.length > 8 ? words.slice(0, 8) : words).join(' ');
  const mins = parseInt(String((recipe && recipe.totalTime) || '').replace(/\D/g, ''), 10);
  const suffix = Number.isFinite(mins) && mins > 0 && mins <= 35 ? ` (${mins}-Minute)` : '';
  return `${core || raw}${suffix}`.trim();
}

function generateDescription(recipe, style = 'standard') {
  const desc = recipe.description || '';
  const time = recipe.totalTime ? `Ready in ${recipe.totalTime}.` : '';
  const servings = recipe.servings ? `Serves ${recipe.servings}.` : '';
  const hashtags = generateHashtags(recipe).join(' ');
  
  let body = '';
  
  switch (style) {
    case 'time_focused':
      body = `Need dinner FAST? ${desc} ${time}`;
      break;
    case 'seasonal':
      const season = getCurrentSeason();
      if (season === 'cinco_de_mayo') {
        body = `🎉 Perfect for your Cinco de Mayo fiesta! ${desc} ${time}`;
      } else if (season === 'easter') {
        body = `🐣 A beautiful addition to your Easter table. ${desc} ${time}`;
      } else if (season === 'thanksgiving') {
        body = `🦃 Your Thanksgiving guests will love this! ${desc} ${time}`;
      } else if (season === 'christmas') {
        body = `🎄 Holiday perfection! ${desc} ${time}`;
      } else {
        body = `${desc} ${time}`;
      }
      break;
    case 'enthusiastic':
      body = `You HAVE to try this! ${desc} ${time}`;
      break;
    default:
      body = `${desc} ${time} ${servings}`;
  }
  
  const cta = '📌 Save this recipe! Full instructions at the link.';
  
  // Pinterest description limit is 500 chars
  const fullDesc = `${body.trim()} ${cta} ${hashtags}`.trim();
  return fullDesc.substring(0, 500);
}

// ============================================================
// PINTEREST API
// ============================================================

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

  console.log(`Creating new board: ${boardName}`);
  const createRes = await pinterestRequest('POST', '/boards', {
    name: boardName,
    description: `${boardName} from Improv Oven — simple, budget-friendly recipes with a Miami twist.`,
    privacy: 'PUBLIC'
  });

  if (createRes.status !== 201) {
    throw new Error(`Failed to create board: ${JSON.stringify(createRes.data)}`);
  }

  console.log(`✓ Created board: ${boardName} (${createRes.data.id})`);
  return createRes.data.id;
}

function getBoardName(recipe, variant = 'primary') {
  const category = (recipe.category || '').toLowerCase();
  const cuisine = (recipe.cuisine || '').toLowerCase();
  const keyword = `${recipe.targetKeyword || ''} ${recipe.keyword || ''}`.toLowerCase();
  const totalMins = parseInt(String(recipe.totalTime || '').replace(/\D/g, ''), 10) || 0;

  const boardMap = variant === 'primary' ? BOARD_MAP : SECONDARY_BOARD_MAP;

  function stableBucket(input) {
    const text = String(input || '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 100;
  }

  function hasQuickSignal() {
    if (keyword.includes('quick') || keyword.includes('30 minute') || keyword.includes('20 minute') || keyword.includes('15 minute')) return true;
    return totalMins > 0 && totalMins <= 30;
  }

  function hasBudgetSignal() {
    return keyword.includes('budget') || keyword.includes('cheap') || keyword.includes('affordable') || keyword.includes('under $');
  }

  function selectBoard(board, route) {
    console.log(`🧭 Selected board route: ${route} -> ${board}`);
    return board;
  }

  if (category === 'breakfast' || keyword.includes('breakfast')) return selectBoard(boardMap.breakfast || BOARD_MAP.breakfast, `${variant}-breakfast`);
  if (category === 'dessert' || keyword.includes('dessert') || keyword.includes('cookie') || keyword.includes('cake')) return selectBoard(boardMap.dessert || BOARD_MAP.dessert, `${variant}-dessert`);
  if (cuisine.includes('italian')) return selectBoard(boardMap.italian || BOARD_MAP.italian, `${variant}-italian`);

  // Spread Mexican pins across high-intent boards to avoid over-concentrating on one board.
  if (variant === 'primary' && cuisine.includes('mexican')) {
    const seed = recipe.slug || recipe.title || keyword;
    const bucket = stableBucket(seed);
    const isQuick = hasQuickSignal();
    const isBudget = hasBudgetSignal();

    if (isQuick && isBudget) {
      if (bucket < 40) return selectBoard(boardMap.quick || BOARD_MAP.quick, `${variant}-mexican-quick-budget-quick`);
      if (bucket < 80) return selectBoard(boardMap.budget || BOARD_MAP.budget, `${variant}-mexican-quick-budget-budget`);
      return selectBoard(boardMap.latin || BOARD_MAP.latin, `${variant}-mexican-quick-budget-latin`);
    }
    if (isQuick) return bucket < 70
      ? selectBoard(boardMap.quick || BOARD_MAP.quick, `${variant}-mexican-quick`)
      : selectBoard(boardMap.latin || BOARD_MAP.latin, `${variant}-mexican-quick-latin`);
    if (isBudget) return bucket < 70
      ? selectBoard(boardMap.budget || BOARD_MAP.budget, `${variant}-mexican-budget`)
      : selectBoard(boardMap.latin || BOARD_MAP.latin, `${variant}-mexican-budget-latin`);
    if (bucket < 20) return selectBoard(boardMap.quick || BOARD_MAP.quick, `${variant}-mexican-rotate-quick`);
    if (bucket < 40) return selectBoard(boardMap.budget || BOARD_MAP.budget, `${variant}-mexican-rotate-budget`);
    return selectBoard(boardMap.latin || BOARD_MAP.latin, `${variant}-mexican-rotate-latin`);
  }

  if (['latin american', 'mexican', 'cuban', 'venezuelan', 'argentine', 'puerto rican', 'latin caribbean', 'cuban-american'].some(c => cuisine.includes(c))) return selectBoard(boardMap.latin || BOARD_MAP.latin, `${variant}-latin`);
  if (hasBudgetSignal()) return selectBoard(boardMap.budget || BOARD_MAP.budget, `${variant}-budget`);
  if (hasQuickSignal()) return selectBoard(boardMap.quick || BOARD_MAP.quick, `${variant}-quick`);
  return selectBoard(boardMap.default || BOARD_MAP.default, `${variant}-default`);
}

function getImageUrl(recipe, slug) {
  // Prefer the dedicated vertical Pinterest image if it's in the repo.
  // Pinterest performs best with 2:3-ish / vertical assets; `hero.jpg` is often wide.
  const pinterestPath = path.join(__dirname, '..', 'recipes', slug, 'images', 'pinterest.jpg');
  const rel = recipe.image || (fs.existsSync(pinterestPath)
    ? `/recipes/${slug}/images/pinterest.jpg`
    : `/recipes/${slug}/images/hero.jpg`);
  if (rel.startsWith('http')) return rel;
  return `${SITE_URL}${rel.startsWith('/') ? rel : `/${rel}`}`;
}

async function postSinglePin(recipe, slug, variation, boardVariant = 'primary') {
  const boardName = getBoardName(recipe, boardVariant);
  const boardId = await getOrCreateBoard(boardName);
  
  const imageUrl = getImageUrl(recipe, slug);
  const recipeUrl = `${SITE_URL}/recipes/${slug}/`;
  const description = generateDescription(recipe, variation.descriptionStyle);

  const pinData = {
    board_id: boardId,
    title: variation.title.substring(0, 100), // Pinterest title limit
    description,
    link: recipeUrl,
    media_source: {
      source_type: 'image_url',
      url: imageUrl
    }
  };

  console.log(`📌 Posting pin: "${variation.title}" to ${boardName}`);
  console.log(`   Image URL: ${imageUrl}`);
  const res = await pinterestRequest('POST', '/pins', pinData);

  if (res.status === 201) {
    console.log(`✓ Pin created: ${res.data.id}`);
    return res.data.id;
  } else {
    console.error(`❌ Failed to create pin: ${JSON.stringify(res.data)}`);
    throw new Error(`Pin creation failed with status ${res.status}`);
  }
}

async function postToPinterest(recipe, slug) {
  if (!ACCESS_TOKEN) {
    console.log('⚠ No Pinterest access token — skipping');
    return;
  }

  // Wait for Cloudflare Pages deployment to complete
  // Pinterest fetches images from the live URL, so they must be deployed first
  const DEPLOY_WAIT = parseInt(process.env.PINTEREST_DEPLOY_WAIT) || 90;
  console.log(`⏳ Waiting ${DEPLOY_WAIT}s for Cloudflare deployment...`);
  await new Promise(r => setTimeout(r, DEPLOY_WAIT * 1000));

  // Post single pin with optimized hashtags
  const variation = { title: buildScannablePinTitle(recipe), descriptionStyle: 'standard' };
  const pinId = await postSinglePin(recipe, slug, variation, 'primary');

  console.log(`\n✅ Pinterest: pin created`);
  return pinId;
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

module.exports = { postToPinterest, generateHashtags, generatePinVariations };
