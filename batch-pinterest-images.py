#!/usr/bin/env python3
# batch-pinterest-images.py
# Generates vertical Pinterest images for all existing recipes
# Run from root of improvoven-site:
# python3 batch-pinterest-images.py

import os
import json
from PIL import Image, ImageDraw, ImageFont

def make_pinterest_image(hero_path, title, output_path):
    img = Image.open(hero_path).convert('RGB')
    w, h = img.size
    
    target_w = min(w, int(h * 2/3))
    target_h = int(target_w * 3/2)
    if w > target_w:
        left = (w - target_w) // 2
        img = img.crop((left, 0, left + target_w, min(h, target_h)))
    img = img.resize((1000, 1500), Image.LANCZOS)
    
    overlay = Image.new('RGBA', (1000, 1500), (0, 0, 0, 0))
    ov_draw = ImageDraw.Draw(overlay)
    for i in range(600):
        alpha = int((i / 600) * 210)
        ov_draw.rectangle([(0, 1500 - i), (1000, 1500 - i + 1)], fill=(15, 30, 20, alpha))
    
    img = img.convert('RGBA')
    img = Image.alpha_composite(img, overlay)
    img = img.convert('RGB')
    draw = ImageDraw.Draw(img)
    
    try:
        font_title = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 72)
        font_brand = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 32)
    except:
        font_title = font_brand = ImageFont.load_default()
    
    words = title.split()
    lines = []
    current = []
    for word in words:
        test_line = ' '.join(current + [word])
        bbox = draw.textbbox((0, 0), test_line, font=font_title)
        if bbox[2] - bbox[0] > 880 and current:
            lines.append(' '.join(current))
            current = [word]
        else:
            current.append(word)
    if current:
        lines.append(' '.join(current))
    
    line_height = 85
    total_height = len(lines) * line_height
    y_start = 1500 - total_height - 120
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font_title)
        text_w = bbox[2] - bbox[0]
        x = (1000 - text_w) // 2
        draw.text((x+2, y_start+2), line, fill=(0, 0, 0, 180), font=font_title)
        draw.text((x, y_start), line, fill=(250, 247, 242), font=font_title)
        y_start += line_height
    
    draw.rectangle([(60, 1500-55), (940, 1500-50)], fill=(82, 183, 136))
    brand = 'ImprovOven.com'
    bbox = draw.textbbox((0, 0), brand, font=font_brand)
    bw = bbox[2] - bbox[0]
    draw.text(((1000 - bw)//2, 1500-42), brand, fill=(82, 183, 136), font=font_brand)
    
    img.save(output_path, 'JPEG', quality=92)

# Load all recipes
with open('recipes-data.json') as f:
    recipes = json.load(f)

print(f'Generating Pinterest images for {len(recipes)} recipes...\n')
done = 0
skipped = 0
failed = 0

for r in recipes:
    slug = r['slug']
    title = r['title']
    
    # Find hero image
    hero_webp = os.path.join('recipes', slug, 'images', 'hero.webp')
    hero_jpg = os.path.join('recipes', slug, 'images', 'hero.jpg')
    hero_path = hero_webp if os.path.exists(hero_webp) else hero_jpg if os.path.exists(hero_jpg) else None
    
    pinterest_path = os.path.join('recipes', slug, 'images', 'pinterest.jpg')
    
    if os.path.exists(pinterest_path):
        skipped += 1
        continue
    
    if not hero_path:
        print(f'⚠ No hero image: {slug}')
        failed += 1
        continue
    
    try:
        make_pinterest_image(hero_path, title, pinterest_path)
        print(f'✓ {title[:60]}')
        done += 1
    except Exception as e:
        print(f'❌ {slug}: {e}')
        failed += 1

print(f'\n✅ Done: {done} generated, {skipped} skipped, {failed} failed')
print('Commit and push in GitHub Desktop.')
