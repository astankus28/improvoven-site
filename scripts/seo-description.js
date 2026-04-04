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

/** Rotating closings so JSON-LD / fallback meta are not identical across dozens of pages (Bing SEO). */
function closingVariant(seed) {
  const s = String(seed || 'improvoven');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  const variants = [
    'Budget-friendly weeknight recipe from Improv Oven.',
    'Pantry staples and Miami-inspired flavor from Improv Oven.',
    'Simple ingredients, big taste — Improv Oven.',
    'Home-cooked and budget-smart from Improv Oven.',
    'Easy weeknight cooking from the Improv Oven blog.',
    'Affordable comfort food from Improv Oven.',
    'Quick to make, full of flavor — Improv Oven.',
    'Real food, real easy — Improv Oven.',
    'Weeknight-friendly dish from Improv Oven.',
    'Pantry cooking with Latin flair from Improv Oven.',
  ];
  return variants[h % variants.length];
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
 * Rich Recipe schema description from structured fields (not the marketing blurb).
 * @param {object} recipe — shape like schema.org Recipe or site recipe object
 * @param {string} [uniqueSeed] — URL slug or id so the closing line varies per page
 */
function buildRecipeSchemaDescription(recipe, uniqueSeed) {
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
  const seed = uniqueSeed || recipe.slug || name;
  s += closingVariant(seed);
  return s.replace(/\s+/g, ' ').trim();
}

/** Bing / modern SERPs: avoid “too short” warnings (aim 152–165 visible chars). */
const META_DESC_MIN = 152;
const META_DESC_MAX = 165;

function truncateMeta(text, max = META_DESC_MAX) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const sp = slice.lastIndexOf(' ');
  return (sp > 90 ? slice.slice(0, sp) : slice) + '…';
}

/**
 * Pad short descriptions with seed-varied phrases, then clamp to META_DESC_MAX.
 * @param {string} text
 * @param {string} [seed] — slug or path so appended clauses differ by page
 */
function finalizeMetaDescription(text, seed = '') {
  let t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) t = 'Easy recipes and weeknight dinner ideas from Improv Oven.';
  const pads = [
    ' Step-by-step on Improv Oven with pantry swaps and timing.',
    ' Full ingredients, tips, and related meals at improvoven.com.',
    ' Budget weeknight cooking — Miami- and Latin-inspired ideas from Improv Oven.',
    ' Practical home-cooking notes and serving ideas on the Improv Oven recipe page.',
    ' More quick dinners and pantry-stretching ideas from Improv Oven.',
    ' Simple techniques, real ingredients — read the full walkthrough on Improv Oven.',
  ];
  let h = 0;
  const s = String(seed || t.slice(0, 48));
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  let i = 0;
  while (t.length < META_DESC_MIN && i < 14) {
    const pad = pads[(h + i) % pads.length];
    if (!t.includes(pad.trim())) t += pad;
    i += 1;
  }
  if (t.length < META_DESC_MIN) {
    t += ' Discover more easy recipes at www.improvoven.com.';
  }
  return truncateMeta(t, META_DESC_MAX);
}

/**
 * Meta / Open Graph description: unique per page, not below META_DESC_MIN when padded.
 */
function buildRecipeMetaDescription(recipeLike) {
  const raw = (recipeLike.description || '').trim();
  const seed = recipeLike.slug || recipeLike.title || recipeLike.name || '';
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

  let body;
  if (!isGenericRecipeDescription(raw) && raw.length >= 110) {
    body = raw;
  } else {
    body = buildRecipeSchemaDescription(schemaShape, seed);
  }
  return finalizeMetaDescription(body, seed);
}

/**
 * JSON-LD Recipe.description: full sentence(s), unique per recipe.
 */
function buildRecipeJsonLdDescription(recipeLike) {
  const raw = (recipeLike.description || '').trim();
  const seed = recipeLike.slug || recipeLike.title || recipeLike.name || '';
  if (!isGenericRecipeDescription(raw)) return raw;
  return buildRecipeSchemaDescription(
    {
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
    },
    seed,
  );
}

module.exports = {
  isGenericRecipeDescription,
  closingVariant,
  buildRecipeSchemaDescription,
  buildRecipeMetaDescription,
  buildRecipeJsonLdDescription,
  formatIsoDuration,
  truncateMeta,
  finalizeMetaDescription,
  META_DESC_MIN,
  META_DESC_MAX,
};
