#!/usr/bin/env node
/**
 * backfill-pinterest-images.js
 *
 * Regenerates pinterest.jpg for every existing recipe using the new
 * bottom-card layout with hook copy, badge pills, and brand foot.
 *
 * Prerequisites: Python 3 + Pillow (pip install Pillow)
 *
 * Usage:
 *   node scripts/backfill-pinterest-images.js            # all recipes
 *   node scripts/backfill-pinterest-images.js --limit 10 # first 10 only
 *   node scripts/backfill-pinterest-images.js --force     # overwrite existing
 *   node scripts/backfill-pinterest-images.js --slug apple-walnut-salad
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Inline the overlay functions from generate-recipe.js so this script
// is self-contained and can run standalone.

// ── Copy of buildPinterestOverlayCopy ────────────────────────────────────
function buildPinterestOverlayCopy(recipe) {
  const rawTitle = String((recipe && recipe.title) || (recipe && recipe.targetKeyword) || 'Easy Weeknight Recipe');
  const totalMins = parseInt(String((recipe && recipe.totalTime) || '').replace(/\D/g, ''), 10);
  const servings = parseInt(String((recipe && recipe.servings) || '').replace(/\D/g, ''), 10);
  const ingredients = Array.isArray(recipe && recipe.ingredients) ? recipe.ingredients.length : 0;
  const category = String((recipe && recipe.category) || '').toLowerCase();
  const keyword = String((recipe && recipe.targetKeyword) || '').toLowerCase();

  const cleanTitle = rawTitle
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(easy|simple|homemade|authentic|best|perfect|recipe)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const minsStr = Number.isFinite(totalMins) && totalMins > 0 ? `${totalMins}` : null;
  const ingStr = ingredients >= 3 && ingredients <= 7 ? `${ingredients}` : null;

  const slugHash = rawTitle.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const hookVariant = Math.abs(slugHash) % 6;

  let headline;
  if (hookVariant === 0 && minsStr) {
    headline = `Ready in ${minsStr} Minutes — ${cleanTitle}`;
  } else if (hookVariant === 1 && ingStr) {
    headline = `Only ${ingStr} Ingredients: ${cleanTitle}`;
  } else if (hookVariant === 2) {
    headline = `The Budget ${cleanTitle} You'll Make Every Week`;
  } else if (hookVariant === 3 && minsStr && parseInt(minsStr) <= 25) {
    headline = `${minsStr}-Minute ${cleanTitle} That Tastes Like a Restaurant`;
  } else if (hookVariant === 4) {
    headline = `This ${cleanTitle} Costs Almost Nothing`;
  } else {
    headline = `You Need This ${cleanTitle} in Your Life`;
  }
  if (headline.length > 58) headline = cleanTitle;

  const badges = [];
  if (Number.isFinite(totalMins) && totalMins > 0) badges.push(`${totalMins} MIN`);
  if (Number.isFinite(servings) && servings > 0) badges.push(`SERVES ${servings}`);
  if (ingredients > 0) badges.push(`${ingredients} INGREDIENTS`);
  if (keyword.includes('budget') || keyword.includes('cheap') || keyword.includes('affordable')) {
    badges.push('BUDGET-FRIENDLY');
  } else if (category === 'dessert') {
    badges.push('NO FUSS DESSERT');
  } else {
    badges.push('EASY WEEKNIGHT');
  }

  const cuisine = String((recipe && recipe.cuisine) || '').trim();
  const subtitle = cuisine && cuisine.toLowerCase() !== 'american'
    ? `${cuisine} · Improv Oven`
    : 'Budget Cooking · Improv Oven';

  return { headline, badges, subtitle };
}

// ── Copy of the Python script from makePinterestImage ────────────────────
const PYTHON_SCRIPT = `
import sys, json
from PIL import Image, ImageDraw, ImageFont

hero_path   = sys.argv[1]
headline    = sys.argv[2].strip()
badge_str   = sys.argv[3].strip()
subtitle    = sys.argv[4].strip()
output_path = sys.argv[5]

badges = [b.strip() for b in badge_str.split('|') if b.strip()]

img = Image.open(hero_path).convert('RGB')
w, h = img.size
target_w = min(w, int(h * 2/3))
target_h = int(target_w * 3/2)
if w > target_w:
    left = (w - target_w) // 2
    img = img.crop((left, 0, left + target_w, min(h, target_h)))
img = img.resize((1000, 1500), Image.LANCZOS)

CARD_Y    = 920
CARD_COLOR= (22, 27, 34)
ACCENT    = (255, 183, 77)
TEXT_PRI  = (255, 255, 255)
TEXT_SEC  = (200, 205, 210)
PILL_TXT  = (22, 27, 34)

card = Image.new('RGBA', (1000, 1500 - CARD_Y), CARD_COLOR + (255,))
img  = img.convert('RGBA')
grad_h = 160
gradient = Image.new('RGBA', (1000, grad_h), (0,0,0,0))
gd = ImageDraw.Draw(gradient)
for i in range(grad_h):
    alpha = int((i / grad_h) ** 1.4 * 240)
    gd.rectangle([(0, i), (1000, i+1)], fill=CARD_COLOR + (alpha,))
img.paste(gradient, (0, CARD_Y - grad_h), gradient)
img.paste(card, (0, CARD_Y), card)
img = img.convert('RGB')
draw = ImageDraw.Draw(img)

FONT_PATHS   = ['/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
                '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
                '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
                '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf']
SANS_PATHS   = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf',
                '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
                '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf']
SANS_REG     = ['/System/Library/Fonts/Supplemental/Arial.ttf',
                '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf']

def load_font(paths, size):
    for p in paths:
        try: return ImageFont.truetype(p, size)
        except: pass
    return ImageFont.load_default()

font_headline = load_font(FONT_PATHS, 88)
font_pill     = load_font(SANS_PATHS, 30)
font_sub      = load_font(SANS_REG,   36)
font_brand    = load_font(SANS_PATHS, 32)

PILL_H=46; PILL_PAD=22; PILL_R=10; PILL_GAP=14; LEFT_MARGIN=52
pill_y = CARD_Y + 42
x_cursor = LEFT_MARGIN
pill_coords = []
for badge in badges[:4]:
    bbox = draw.textbbox((0,0), badge, font=font_pill)
    tw = bbox[2] - bbox[0]
    pw = tw + PILL_PAD * 2
    pill_coords.append((x_cursor, badge, tw, pw))
    x_cursor += pw + PILL_GAP

for (px, badge, tw, pw) in pill_coords:
    draw.rounded_rectangle([(px, pill_y),(px+pw, pill_y+PILL_H)], radius=PILL_R, fill=ACCENT)
    tx = px + PILL_PAD
    ty = pill_y + (PILL_H - draw.textbbox((0,0), badge, font=font_pill)[3]) // 2
    draw.text((tx, ty), badge, fill=PILL_TXT, font=font_pill)

MAX_W=920; HL_Y=pill_y+PILL_H+28; HL_LH=96

def wrap_text(text, font, max_w):
    words = text.split()
    lines, cur = [], []
    for word in words:
        trial = ' '.join(cur + [word])
        if draw.textbbox((0,0), trial, font=font)[2] > max_w and cur:
            lines.append(' '.join(cur)); cur=[word]
        else:
            cur.append(word)
    if cur: lines.append(' '.join(cur))
    return lines

hl_lines = wrap_text(headline, font_headline, MAX_W)[:3]
y = HL_Y
for line in hl_lines:
    draw.text((LEFT_MARGIN+2, y+2), line, fill=(0,0,0,160), font=font_headline)
    draw.text((LEFT_MARGIN, y),     line, fill=TEXT_PRI,    font=font_headline)
    y += HL_LH

sub_y = y + 20
draw.text((LEFT_MARGIN, sub_y), subtitle, fill=TEXT_SEC, font=font_sub)

div_y = sub_y + 56
draw.rectangle([(LEFT_MARGIN, div_y),(1000-LEFT_MARGIN, div_y+2)], fill=(60,70,80))

brand_y = div_y + 16
draw.text((LEFT_MARGIN, brand_y), 'ImprovOven.com', fill=ACCENT, font=font_brand)
save_hint = 'Save this recipe \u2193'
bw = draw.textbbox((0,0), save_hint, font=font_brand)[2]
draw.text((1000-LEFT_MARGIN-bw, brand_y), save_hint, fill=TEXT_SEC, font=font_brand)

img.save(output_path, 'JPEG', quality=93)
`;

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10) || 0;
const FORCE = args.includes('--force');
const SINGLE_SLUG = args.find(a => a.startsWith('--slug='))?.split('=')[1] ?? null;

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  const dataPath = path.join(process.cwd(), 'recipes-data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('recipes-data.json not found — run from project root');
    process.exit(1);
  }

  const all = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  let recipes = Array.isArray(all) ? all : [];

  if (SINGLE_SLUG) {
    recipes = recipes.filter(r => r.slug === SINGLE_SLUG);
    if (!recipes.length) { console.error(`Slug not found: ${SINGLE_SLUG}`); process.exit(1); }
  }

  if (LIMIT > 0) recipes = recipes.slice(0, LIMIT);

  console.log(`🎨 Backfill Pinterest images — ${recipes.length} recipes (force=${FORCE})\n`);

  let ok = 0, skipped = 0, failed = 0;

  for (const recipe of recipes) {
    const slug = recipe.slug;
    if (!slug) { skipped++; continue; }

    const imagesDir = path.join(process.cwd(), 'recipes', slug, 'images');
    if (!fs.existsSync(imagesDir)) { skipped++; continue; }

    // Find hero image (prefer webp → jpg → png)
    let heroPath = null;
    for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
      const p = path.join(imagesDir, `hero.${ext}`);
      if (fs.existsSync(p)) { heroPath = p; break; }
    }
    if (!heroPath) {
      console.log(`  ⚠  ${slug}: no hero image, skipping`);
      skipped++;
      continue;
    }

    const outPath = path.join(imagesDir, 'pinterest.jpg');
    if (fs.existsSync(outPath) && !FORCE) {
      skipped++;
      continue;
    }

    const { headline, badges, subtitle } = buildPinterestOverlayCopy(recipe);
    const badgeStr = badges.join('|');

    process.stdout.write(`  → ${slug.slice(0, 55).padEnd(55)} `);

    const run = spawnSync(
      'python3',
      ['-c', PYTHON_SCRIPT, heroPath, headline, badgeStr, subtitle, outPath],
      { stdio: 'pipe' },
    );

    if (run.status === 0) {
      console.log('✓');
      ok++;
    } else {
      const errMsg = (run.stderr || Buffer.from('')).toString('utf8').slice(0, 120).trim();
      console.log(`✗  ${errMsg}`);
      failed++;
    }
  }

  console.log(`\nDone: ${ok} generated, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
