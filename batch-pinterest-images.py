#!/usr/bin/env python3
# batch-pinterest-images.py
# Run from root of improvoven-site: python3 batch-pinterest-images.py

import os, json
from PIL import Image, ImageDraw, ImageFont

def make_pinterest_image(hero_path, title, output_path):
    img = Image.open(hero_path).convert('RGB')
    w, h = img.size
    target_w, target_h = 1000, 1500

    # Smart crop — find brightest/most food-like region
    if w / h > 2/3:
        new_w = int(h * 2/3)
        third = new_w // 3
        samples = []
        for start in [0, (w - new_w)//2, w - new_w]:
            region = img.crop((max(0,start), h//4, min(w,start+new_w), 3*h//4))
            brightness = sum(sum(p) for p in region.getdata()) / (region.width * region.height * 3)
            samples.append((brightness, max(0, start)))
        best = max(samples, key=lambda x: -abs(x[0] - 130))
        img = img.crop((best[1], 0, best[1] + new_w, h))
    else:
        new_h = int(w * 3/2)
        if h > new_h:
            img = img.crop((0, 0, w, new_h))

    img = img.resize((target_w, target_h), Image.LANCZOS)

    # Overlays
    overlay = Image.new('RGBA', (target_w, target_h), (0, 0, 0, 0))
    ov = ImageDraw.Draw(overlay)
    for i in range(700):
        alpha = int((i / 700) ** 0.7 * 220)
        ov.rectangle([(0, target_h-i), (target_w, target_h-i+1)], fill=(10,25,15,alpha))
    for i in range(120):
        alpha = int((i/120)*140)
        ov.rectangle([(0, 120-i), (target_w, 121-i)], fill=(10,25,15,alpha))

    img = img.convert('RGBA')
    img = Image.alpha_composite(img, overlay)
    img = img.convert('RGB')
    draw = ImageDraw.Draw(img)

    try:
        f88 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 88)
        f72 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 72)
        fbrand = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34)
        furl = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 28)
    except:
        f88 = f72 = fbrand = furl = ImageFont.load_default()

    draw.text((50, 28), 'IMPROV OVEN', fill=(82,183,136), font=fbrand)

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

    lines = wrap(title, f88)
    if len(lines) > 3:
        lines = wrap(title, f72); font = f72; lh = 90
    else:
        font = f88; lh = 108

    y = target_h - len(lines)*lh - 90
    for line in lines:
        bbox = draw.textbbox((0,0), line, font=font)
        x = (target_w - (bbox[2]-bbox[0])) // 2
        draw.text((x+3, y+3), line, fill=(0,0,0,160), font=font)
        draw.text((x, y), line, fill=(255,252,245), font=font)
        y += lh

    draw.rectangle([(50, target_h-52),(target_w-50, target_h-47)], fill=(82,183,136))
    url = 'improvoven.com'
    bbox = draw.textbbox((0,0), url, font=furl)
    draw.text(((target_w-(bbox[2]-bbox[0]))//2, target_h-38), url, fill=(180,220,195), font=furl)

    img.save(output_path, 'JPEG', quality=92)

with open('recipes-data.json') as f:
    recipes = json.load(f)

print(f'Generating Pinterest images for {len(recipes)} recipes...\n')
done = skipped = failed = 0

for r in recipes:
    slug, title = r['slug'], r['title']
    hero = next((p for p in [f'recipes/{slug}/images/hero.webp', f'recipes/{slug}/images/hero.jpg'] if os.path.exists(p)), None)
    out = f'recipes/{slug}/images/pinterest.jpg'
    if os.path.exists(out): skipped += 1; continue
    if not hero: print(f'⚠ No image: {slug}'); failed += 1; continue
    try:
        make_pinterest_image(hero, title, out)
        print(f'✓ {title[:65]}'); done += 1
    except Exception as e:
        print(f'❌ {slug}: {e}'); failed += 1

print(f'\n✅ {done} generated, {skipped} skipped, {failed} failed')
print('Commit and push in GitHub Desktop.')
