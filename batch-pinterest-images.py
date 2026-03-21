#!/usr/bin/env python3
# batch-pinterest-images.py
# Run from root of improvoven-site: python3 batch-pinterest-images.py

import os, json
from PIL import Image, ImageDraw, ImageFont

def make_pinterest_image(hero_path, title, output_path):
    W, H = 1000, 1500
    
    # Load food image and place in top 55% of canvas
    food = Image.open(hero_path).convert('RGB')
    food_section_h = int(H * 0.58)
    
    # Resize food image to fill top section (crop center if needed)
    fw, fh = food.size
    scale = max(W / fw, food_section_h / fh)
    new_fw = int(fw * scale)
    new_fh = int(fh * scale)
    food = food.resize((new_fw, new_fh), Image.LANCZOS)
    # Center crop
    left = (new_fw - W) // 2
    top = (new_fh - food_section_h) // 2
    food = food.crop((left, top, left + W, top + food_section_h))
    
    # Create canvas
    canvas = Image.new('RGB', (W, H), (45, 90, 60))  # dark green background
    canvas.paste(food, (0, 0))
    
    # Bottom section - solid dark green brand area
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([(0, food_section_h), (W, H)], fill=(35, 75, 50))
    
    # Green accent line between image and text area
    draw.rectangle([(0, food_section_h), (W, food_section_h + 6)], fill=(82, 183, 136))
    
    # Fonts
    try:
        f_title_lg = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 82)
        f_title_md = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 66)
        f_title_sm = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 54)
        f_brand = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 36)
        f_url = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 30)
        f_tag = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 26)
    except:
        f_title_lg = f_title_md = f_title_sm = f_brand = f_url = f_tag = ImageFont.load_default()

    # Wrap title text
    def wrap(text, font, max_w=860):
        words = text.split(); lines = []; cur = []
        for word in words:
            test = ' '.join(cur + [word])
            bbox = draw.textbbox((0,0), test, font=font)
            if bbox[2]-bbox[0] > max_w and cur:
                lines.append(' '.join(cur)); cur = [word]
            else:
                cur.append(word)
        if cur: lines.append(' '.join(cur))
        return lines

    # Pick font size based on title length
    if len(title) < 30:
        font = f_title_lg; lh = 98
    elif len(title) < 50:
        font = f_title_md; lh = 82
    else:
        font = f_title_sm; lh = 68

    lines = wrap(title, font)
    # If still too many lines, go smaller
    if len(lines) > 4 and font != f_title_sm:
        font = f_title_sm; lh = 68
        lines = wrap(title, font)

    # Center title vertically in bottom section
    text_area_start = food_section_h + 40
    text_area_h = H - text_area_start - 120  # leave room for branding at bottom
    total_text_h = len(lines) * lh
    y = text_area_start + (text_area_h - total_text_h) // 2

    for line in lines:
        bbox = draw.textbbox((0,0), line, font=font)
        x = (W - (bbox[2]-bbox[0])) // 2
        draw.text((x, y), line, fill=(255, 252, 240), font=font)
        y += lh

    # Bottom branding
    draw.rectangle([(0, H-90), (W, H-84)], fill=(82, 183, 136))
    
    brand = 'IMPROV OVEN'
    bbox = draw.textbbox((0,0), brand, font=f_brand)
    draw.text(((W-(bbox[2]-bbox[0]))//2, H-78), brand, fill=(82,183,136), font=f_brand)
    
    url = 'improvoven.com'
    bbox = draw.textbbox((0,0), url, font=f_url)
    draw.text(((W-(bbox[2]-bbox[0]))//2, H-38), url, fill=(150,200,170), font=f_url)

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
