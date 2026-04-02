require('dotenv').config();
const fs = require('fs');
const path = require('path');

const RECIPES_DIR = path.join(process.cwd(), 'recipes');

const recipesToFix = [
  'bacon-egg-and-cheese-sandwich-on-a-croissant',
  'easy-baked-salmon-recipe-2-ingredients',
  'easy-egg-white-omelette-recipe',
  'easy-homemade-chicken-wings-recipe',
  'eggs-in-a-basket-simple-3-ingredient-egg-cups',
  'linguine-with-white-clam-sauce-recipe',
  'potato-lasagna-with-creamy-white-sauce',
  'venezuelan-teque-os-fried-cheese-sticks-recipe'
];

function extractRecipeData(htmlContent) {
  const titleMatch = htmlContent.match(/<h1[^>]*class="recipe-title"[^>]*>([^<]+)<\/h1>/);
  const title = titleMatch ? titleMatch[1].trim() : '';

  const descMatch = htmlContent.match(/<p[^>]*class="recipe-desc"[^>]*>([^<]+)<\/p>/);
  const description = descMatch ? descMatch[1].trim() : '';

  const ingredientsMatch = htmlContent.match(/<ul[^>]*class="ingredients-list"[^>]*>([\s\S]*?)<\/ul>/);
  const ingredients = [];
  if (ingredientsMatch) {
    const liMatches = ingredientsMatch[1].match(/<li[^>]*itemprop="recipeIngredient"[^>]*>([^<]+)<\/li>/g);
    if (liMatches) {
      liMatches.forEach(li => {
        const match = li.match(/>([^<]+)</);
        if (match) ingredients.push(match[1].trim());
      });
    }
  }

  const instructionsMatch = htmlContent.match(/<ol[^>]*class="instructions-list"[^>]*>([\s\S]*?)<\/ol>/);
  const instructions = [];
  if (instructionsMatch) {
    const stepMatches = instructionsMatch[1].match(/<span[^>]*itemprop="text"[^>]*>([^<]+)<\/span>/g);
    if (stepMatches) {
      stepMatches.forEach(step => {
        const match = step.match(/>([^<]+)</);
        if (match) instructions.push(match[1].trim());
      });
    }
  }

  const stats = {};
  const prepMatch = htmlContent.match(/<div[^>]*class="stat-label"[^>]*>Prep<\/div><div[^>]*class="stat-val"[^>]*>([^<]+)<\/div>/);
  if (prepMatch) stats.prep = prepMatch[1].trim();
  
  const cookMatch = htmlContent.match(/<div[^>]*class="stat-label"[^>]*>Cook<\/div><div[^>]*class="stat-val"[^>]*>([^<]+)<\/div>/);
  if (cookMatch) stats.cook = cookMatch[1].trim();
  
  const servesMatch = htmlContent.match(/<div[^>]*class="stat-label"[^>]*>Serves<\/div><div[^>]*class="stat-val"[^>]*>([^<]+)<\/div>/);
  if (servesMatch) stats.serves = servesMatch[1].trim();

  return { title, description, ingredients, instructions, stats };
}

function timeStringToISO(timeStr) {
  const match = timeStr.match(/(\d+)\s*(min|hour)/i);
  if (!match) return 'PT0M';
  const value = match[1];
  const unit = match[2].toLowerCase().startsWith('h') ? 'H' : 'M';
  return `PT${value}${unit}`;
}

function buildRecipeJSON(recipeSlug, data) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    'name': data.title,
    'description': data.description,
    'author': {
      '@type': 'Organization',
      'name': 'Improv Oven',
      'url': 'https://www.improvoven.com'
    },
    'datePublished': new Date().toISOString().split('T')[0],
    'prepTime': timeStringToISO(data.stats.prep || 'PT0M'),
    'cookTime': timeStringToISO(data.stats.cook || 'PT0M'),
    'recipeYield': data.stats.serves || '4 servings',
    'recipeCategory': 'Dinner',
    'recipeCuisine': 'American',
    'keywords': data.title.toLowerCase(),
    'recipeIngredient': data.ingredients,
    'recipeInstructions': data.instructions.map((text, idx) => ({
      '@type': 'HowToStep',
      'position': idx + 1,
      'text': text
    }))
  };
}

function updateHTMLWithSchema(htmlContent, jsonSchema) {
  const schemaBlock = `<script type="application/ld+json">\n${JSON.stringify(jsonSchema, null, 2)}\n</script>`;
  const updated = htmlContent.replace(
    /<script type="application\/ld\+json">\s*{[\s\S]*?}\s*<\/script>/,
    schemaBlock
  );
  return updated;
}

function fixRecipe(recipeSlug) {
  const htmlPath = path.join(RECIPES_DIR, recipeSlug, 'index.html');
  
  if (!fs.existsSync(htmlPath)) {
    console.log(`⚠️  ${recipeSlug}: file not found`);
    return false;
  }

  try {
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    const recipeData = extractRecipeData(htmlContent);
    
    if (!recipeData.title || recipeData.ingredients.length === 0) {
      console.log(`⚠️  ${recipeSlug}: no recipe data found`);
      return false;
    }

    const jsonSchema = buildRecipeJSON(recipeSlug, recipeData);
    const updatedHTML = updateHTMLWithSchema(htmlContent, jsonSchema);
    
    fs.writeFileSync(htmlPath, updatedHTML, 'utf-8');
    
    console.log(`✓ ${recipeSlug}: schema fixed`);
    return true;
  } catch (err) {
    console.log(`✗ ${recipeSlug}: ${err.message}`);
    return false;
  }
}

function main() {
  console.log(`🔧 Fixing JSON-LD schemas for ${recipesToFix.length} recipes\n`);
  
  let fixed = 0;
  for (const recipe of recipesToFix) {
    const success = fixRecipe(recipe);
    if (success) fixed++;
  }

  console.log(`\n📊 Fixed: ${fixed}/${recipesToFix.length}`);
  console.log(`\n🚀 Now run: git add . && git commit -m "fix recipe JSON-LD schemas" && git push`);
}

main();
