#!/usr/bin/env python3
"""Minimal branded placeholder when Replicate/Gemini image APIs are unavailable."""
import sys
from PIL import Image, ImageDraw, ImageFont

title = sys.argv[1] if len(sys.argv) > 1 else 'Improv Oven Recipe'
out_path = sys.argv[2] if len(sys.argv) > 2 else 'hero.jpg'

W, H = 1200, 800
img = Image.new('RGB', (W, H), (250, 246, 238))
draw = ImageDraw.Draw(img)

# Warm accent bar
draw.rectangle([(0, H - 12), (W, H)], fill=(220, 155, 40))

font_paths = [
    '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
]
font_brand_paths = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]

def load_font(paths, size):
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()

font = load_font(font_paths, 52)
font_sm = load_font(font_brand_paths, 28)

brand = 'IMPROV OVEN'
draw.text((60, 50), brand, fill=(140, 100, 45), font=font_sm)

# Wrap title
words = title.split()
lines, cur = [], []
max_w = W - 120
for w in words:
    trial = ' '.join(cur + [w])
    if draw.textbbox((0, 0), trial, font=font)[2] > max_w and cur:
        lines.append(' '.join(cur))
        cur = [w]
    else:
        cur.append(w)
if cur:
    lines.append(' '.join(cur))
lines = lines[:3]

y = 200
for line in lines:
    draw.text((60, y), line, fill=(30, 16, 8), font=font)
    y += 62

draw.text((60, H - 60), 'Photo pending — recipe is live', fill=(140, 100, 45), font=font_sm)
img.save(out_path, 'JPEG', quality=88)
