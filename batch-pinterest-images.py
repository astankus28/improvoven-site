#!/usr/bin/env python3
# batch-pinterest-images.py
# Run from root of improvoven-site: python3 batch-pinterest-images.py

import os, json
from PIL import Image, ImageDraw, ImageFont

def get_font(size, bold=False):
    # Try Mac fonts first, then Linux, then default
    mac_serif_bold = '/System/Library/Fonts/Supplemental/Georgia Bold.ttf'
    mac_serif = '/System/Library/Fonts/Supplemental/Georgia.ttf'
    mac_sans_bold = '/System/Library/Fonts/Helvetica.ttc'
    mac_sans = '/System/Library/Fonts/Helvetica.ttc'
    linux_serif_bold = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
    linux_sans_bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    linux_sans = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    
    candidates = [mac_serif_bold, mac_serif, linux_serif_bold] if bold else [mac_serif, linux_serif_bold]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except:
                continue
    return ImageFont.load_default()

def make_pinterest_image(hero_path, title, output_path):
    W, H = 1000, 1500
    food_h = int(H * 0.58)
    text_h = H - food_h

    food = Image.open(hero_path).convert('RGB')
    fw, fh = food.size
    scale = max(W / fw, food_h / fh)
    food = food.resize((int(fw*scale), int(fh*scale)), Image.LANCZOS)
    nfw, nfh = food.size
    
    positions = [0, (nfw-W)//2, max(0, nfw-W)]
    best_left = (nfw-W)//2
    best_score = -999
    for left in [max(0,p) for p in positions]:
        region = food.crop((left, 0, min(nfw, left+W), food_h))
        pixels = list(region.getdata())
        brightness = sum(sum(p) for p in pixels) / (len(pixels)*3)
        score = -abs(brightness - 125)
        if score > best_score:
            best_score = score
            best_left = left
    food = food.crop((best_left, 0, best_left+W, food_h))

    canvas = Image.new('RGB', (W, H), (35, 75, 50))
    canvas.paste(food, (0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([(0, food_h), (W, H)], fill=(35, 75, 50))
    draw.rectangle([(0, food_h), (W, food_h+6)], fill=(82, 183, 136))

    fbrand = get_font(36, bold=True)
    furl = get_font(30)

    def wrap(text, font, max_w=880):
        words = text.split(); lines = []; cur = []
        for word in words:
            test = ' '.join(cur+[word])
            bbox = draw.textbbox((0,0), test, font=font)
            if bbox[2]-bbox[0] > max_w and cur:
                lines.append(' '.join(cur)); cur = [word]
            else:
                cur.append(word)
        if cur: lines.append(' '.join(cur))
        return lines

    available_h = text_h - 110 - 20
    best_font = get_font(46, bold=True)
    best_lines = wrap(title, best_font)
    best_lh = 60

    for sz in [96, 82, 68, 56, 46]:
        font = get_font(sz, bold=True)
        lines = wrap(title, font)
        lh = int(sz * 1.25)
        total = len(lines) * lh
        if total <= available_h and len(lines) <= 5:
            best_font = font
            best_lines = lines
            best_lh = lh
            break

    total_text = len(best_lines) * best_lh
    y = food_h + 20 + (available_h - total_text) // 2

    for line in best_lines:
        bbox = draw.textbbox((0,0), line, font=best_font)
        x = (W - (bbox[2]-bbox[0])) // 2
        draw.text((x, y), line, fill=(255, 252, 240), font=best_font)
        y += best_lh

    draw.rectangle([(0, H-90), (W, H-84)], fill=(82,183,136))
    brand = 'IMPROV OVEN'
    bbox = draw.textbbox((0,0), brand, font=fbrand)
    draw.text(((W-(bbox[2]-bbox[0]))//2, H-78), brand, fill=(82,183,136), font=fbrand)
    url = 'improvoven.com'
    bbox = draw.textbbox((0,0), url, font=furl)
    draw.text(((W-(bbox[2]-bbox[0]))//2, H-38), url, fill=(150,200,170), font=furl)

    canvas.save(output_path, 'JPEG', quality=92)

with open('recipes-data.json') as f:
    recipes = json.load(f)

print(f'Generating Pinterest images for {len(recipes)} recipes...\n')
done = failed = 0

for r in recipes:
    slug, title = r['slug'], r['title']
    hero = next((p for p in [f'recipes/{slug}/images/hero.webp', f'recipes/{slug}/images/hero.jpg'] if os.path.exists(p)), None)
    out = f'recipes/{slug}/images/pinterest.jpg'
    if not hero: print(f'⚠ No image: {slug}'); failed += 1; continue
    try:
        make_pinterest_image(hero, title, out)
        print(f'✓ {title[:65]}'); done += 1
    except Exception as e:
        print(f'❌ {slug}: {e}'); failed += 1

print(f'\n✅ {done} generated, {failed} failed')
print('Commit and push in GitHub Desktop.')
