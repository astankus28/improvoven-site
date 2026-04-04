'use strict';

/** Legacy placeholder used across many migrated recipe pages (duplicate in JSON-LD). */
const GENERIC_DESC =
  /^A delicious and easy recipe that comes together quickly with simple ingredients\.?$/i;

function isGenericRecipeDescription(s) {
  if (s == null || typeof s !== 'string') return true;
  const t = s.trim();
  if (t.length < 20) return true;
  return GENERIC_DESC.test(t);
}

function formatIsoDuration(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return iso.replace(/^PT/i, '').replace(/M$/i, ' min').replace(/H$/i, ' hr');
  const h = parseInt(m[1], 10) || 0;
  const min = parseInt(m[2], 10) || 0;
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (min) parts.push(`${min} minutes`);
  return parts.join(' ') || String(iso);
}

/**
 * Rich, unique Recipe schema description from structured fields (not the marketing blurb).
 * @param {object} recipe — shape like schema.org Recipe or site recipe object
 */
function buildRecipeSchemaDescription(recipe) {
  const name = recipe.name || 'Recipe';
  const ing = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [];
  const top = ing
    .slice(0, 5)
    .map((x) => String(x).split(',')[0].trim())
    .filter(Boolean)
    .join(', ');
  const time = formatIsoDuration(recipe.totalTime || '');
  const yld = recipe.recipeYield ? String(recipe.recipeYield).replace(/\s*servings?/i, '').trim() : '';
  const cat = recipe.recipeCategory || '';
  const cuz = recipe.recipeCuisine || '';

  let s = `${name} — `;
  if (cat) s += `${cat}. `;
  if (cuz) s += `${cuz} flavors. `;
  if (top) s += `Uses ${top}${ing.length > 5 ? ', and more' : ''}. `;
  if (time) s += `About ${time} total. `;
  if (yld) s += `Serves ${yld}. `;
  s += 'Budget-friendly recipe from Improv Oven — Miami-inspired pantry cooking.';
  return s.replace(/\s+/g, ' ').trim();
}

function truncateMeta(text, max = 158) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const sp = slice.lastIndexOf(' ');
  return (sp > 90 ? slice.slice(0, sp) : slice) + '…';
}

/**
 * Meta / Open Graph description: unique, ~120–158 chars when possible.
 */
function buildRecipeMetaDescription(recipeLike) {
  const raw = (recipeLike.description || '').trim();
  const schemaShape = {
    name: recipeLike.title || recipeLike.name,
    recipeIngredient: recipeLike.ingredients || recipeLike.recipeIngredient,
    totalTime: recipeLike.totalTime?.startsWith?.('PT')
      ? recipeLike.totalTime
      : recipeLike.totalTime
        ? `PT${String(recipeLike.totalTime).replace(/\D/g, '')}M`
        : '',
    recipeYield: recipeLike.recipeYield || (recipeLike.servings ? `${recipeLike.servings} servings` : ''),
    recipeCategory: recipeLike.category || recipeLike.recipeCategory,
    recipeCuisine: recipeLike.cuisine || recipeLike.recipeCuisine,
  };

  if (!isGenericRecipeDescription(raw) && raw.length >= 110) {
    return truncateMeta(raw, 158);
  }
  return truncateMeta(buildRecipeSchemaDescription(schemaShape), 158);
}

/**
 * JSON-LD Recipe.description: full sentence(s), unique per recipe.
 */
function buildRecipeJsonLdDescription(recipeLike) {
  const raw = (recipeLike.description || '').trim();
  if (!isGenericRecipeDescription(raw)) return raw;
  return buildRecipeSchemaDescription({
    name: recipeLike.title || recipeLike.name,
    recipeIngredient: recipeLike.ingredients || recipeLike.recipeIngredient,
    totalTime: recipeLike.totalTime?.startsWith?.('PT')
      ? recipeLike.totalTime
      : recipeLike.totalTime
        ? `PT${String(recipeLike.totalTime).replace(/\D/g, '')}M`
        : '',
    recipeYield: recipeLike.recipeYield || (recipeLike.servings ? `${recipeLike.servings} servings` : ''),
    recipeCategory: recipeLike.category || recipeLike.recipeCategory,
    recipeCuisine: recipeLike.cuisine || recipeLike.recipeCuisine,
  });
}

module.exports = {
  isGenericRecipeDescription,
  buildRecipeSchemaDescription,
  buildRecipeMetaDescription,
  buildRecipeJsonLdDescription,
  formatIsoDuration,
  truncateMeta,
};
