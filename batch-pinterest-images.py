#!/usr/bin/env python3
# batch-pinterest-images.py
# Run from root of improvoven-site: python3 batch-pinterest-images.py

import os, json, urllib.request
from PIL import Image, ImageDraw, ImageFont

# ── Font setup ────────────────────────────────────────────────────────────────
FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.pinterest-fonts')
os.makedirs(FONTS_DIR, exist_ok=True)

def download_font(name, url, filename):
    path = os.path.join(FONTS_DIR, filename)
    if not os.path.exists(path):
        print(f'Downloading {name} font...')
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as r, open(path, 'wb') as f:
                f.write(r.read())
            print(f'✓ {name} downloaded')
        except Exception as e:
            print(f'⚠ Could not download {name}: {e}')
            return None
    return path

# Download fonts on first run
DANCING_SCRIPT = download_font(
    'Dancing Script',
    'https://github.com/google/fonts/raw/main/ofl/dancingscript/DancingScript%5Bwght%5D.ttf',
    'DancingScript.ttf'
)
PLAYFAIR = download_font(
    'Playfair Display',
    'https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf',
    'PlayfairDisplay.ttf'
)

def get_font(path, size, fallback_bold=False):
    if path and os.path.exists(path):
        try: return ImageFont.truetype(path, size)
        except: pass
    # Mac fallbacks
    mac = '/System/Library/Fonts/Supplemental/Georgia Bold.ttf' if fallback_bold else '/System/Library/Fonts/Supplemental/Georgia.ttf'
    if os.path.exists(mac):
        try: return ImageFont.truetype(mac, size)
        except: pass
    return ImageFont.load_default()

# ── Crop overrides ─────────────────────────────────────────────────────────────
CROP_OVERRIDES = {
    # 'slug': 0.3  # 0.0=left, 0.5=center, 1.0=right
}

# ── Image builder ──────────────────────────────────────────────────────────────
def make_pinterest_image(hero_path, title, category, output_path, crop_pos=0.5):
    W, H = 1000, 1500
    food_h = int(H * 0.62)  # photo takes up top 62%

    # Load and crop food image
    food = Image.open(hero_path).convert('RGBA')
    fw, fh = food.size
    scale = max(W / fw, food_h / fh)
    food = food.resize((int(fw*scale), int(fh*scale)), Image.LANCZOS)
    nfw, nfh = food.size
    max_left = max(0, nfw - W)
    left = int(max_left * crop_pos)
    food = food.crop((left, 0, left + W, food_h))

    # Create canvas with light linen background
    canvas = Image.new('RGBA', (W, H), (248, 245, 240, 255))  # warm linen

    # Paste food photo
    canvas.paste(food, (0, 0), food if food.mode == 'RGBA' else None)

    # Fade bottom of photo into linen background
    fade_h = 180
    fade_start = food_h - fade_h
    for i in range(fade_h):
        alpha = int(255 * (i / fade_h) ** 1.5)
        y = fade_start + i
        # Draw a linen-colored strip with increasing opacity
        strip = Image.new('RGBA', (W, 1), (248, 245, 240, alpha))
        canvas.alpha_composite(strip, (0, y))

    canvas = canvas.convert('RGB')
    draw = ImageDraw.Draw(canvas)

    # ── Category pill ─────────────────────────────────────────────────────────
    cat_font = get_font(PLAYFAIR, 26)
    cat_text = category.upper()
    cat_bbox = draw.textbbox((0, 0), cat_text, font=cat_font)
    cat_w = cat_bbox[2] - cat_bbox[0] + 40
    cat_h = 40
    cat_x = (W - cat_w) // 2
    cat_y = food_h - 30
    draw.rectangle([(cat_x, cat_y), (cat_x + cat_w, cat_y + cat_h)], fill=(50, 50, 45))
    draw.text((cat_x + 20, cat_y + 6), cat_text, fill=(220, 215, 205), font=cat_font)

    # ── Title text ─────────────────────────────────────────────────────────────
    text_top = food_h + 30
    available_h = H - text_top - 140  # leave room for CTA

    def wrap(text, font, max_w=820):
        words = text.split(); lines = []; cur = []
        for word in words:
            test = ' '.join(cur + [word])
            bbox = draw.textbbox((0, 0), test, font=font)
            if bbox[2] - bbox[0] > max_w and cur:
                lines.append(' '.join(cur)); cur = [word]
            else: cur.append(word)
        if cur: lines.append(' '.join(cur))
        return lines

    # Find best font size
    best_font = get_font(PLAYFAIR, 46)
    best_lines = [title]
    best_lh = 58

    for sz in [110, 96, 82, 68, 56, 46]:
        font = get_font(PLAYFAIR, sz)
        lines = wrap(title.lower(), font)
        lh = int(sz * 1.2)
        if len(lines) * lh <= available_h and len(lines) <= 4:
            best_font = font; best_lines = lines; best_lh = lh; break

    # Center title vertically in text area
    total_h = len(best_lines) * best_lh
    y = text_top + (available_h - total_h) // 2

    for line in best_lines:
        bbox = draw.textbbox((0, 0), line, font=best_font)
        x = (W - (bbox[2] - bbox[0])) // 2
        draw.text((x, y), line, fill=(40, 38, 35), font=best_font)
        y += best_lh

    # ── CTA in script font ─────────────────────────────────────────────────────
    cta_font = get_font(DANCING_SCRIPT, 72)
    cta = 'make it now'
    cta_bbox = draw.textbbox((0, 0), cta, font=cta_font)
    cta_x = (W - (cta_bbox[2] - cta_bbox[0])) // 2
    draw.text((cta_x, H - 115), cta, fill=(100, 130, 100), font=cta_font)

    # Thin divider line above CTA
    draw.rectangle([(W//2 - 60, H - 130), (W//2 + 60, H - 128)], fill=(180, 175, 165))

    # ── Bottom URL ─────────────────────────────────────────────────────────────
    url_font = get_font(PLAYFAIR, 24)
    url = 'improvoven.com'
    url_bbox = draw.textbbox((0, 0), url, font=url_font)
    draw.text(((W - (url_bbox[2] - url_bbox[0])) // 2, H - 36), url, fill=(160, 155, 145), font=url_font)

    canvas.save(output_path, 'JPEG', quality=92)

# ── Main ───────────────────────────────────────────────────────────────────────
with open('recipes-data.json') as f:
    recipes = json.load(f)

print(f'\nGenerating Pinterest images for {len(recipes)} recipes...\n')
done = failed = 0

for r in recipes:
    slug = r['slug']
    title = r['title']
    category = r.get('category', 'Recipe')
    hero = next((p for p in [f'recipes/{slug}/images/hero.webp', f'recipes/{slug}/images/hero.jpg'] if os.path.exists(p)), None)
    out = f'recipes/{slug}/images/pinterest.jpg'
    if not hero: print(f'⚠ No image: {slug}'); failed += 1; continue
    try:
        crop_pos = CROP_OVERRIDES.get(slug, 0.5)
        make_pinterest_image(hero, title, category, out, crop_pos)
        print(f'✓ {title[:65]}'); done += 1
    except Exception as e:
        print(f'❌ {slug}: {e}'); failed += 1

print(f'\n✅ {done} generated, {failed} failed')
print('Commit and push in GitHub Desktop.')
