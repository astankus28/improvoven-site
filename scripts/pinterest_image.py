#!/usr/bin/env python3
"""
pinterest_image.py

Generates a 1000×1500 Pinterest pin from a recipe's hero image.
Uses saliency-based smart-crop so the food subject is always centred —
even when it sits at the bottom/corner of the original photo.

Usage:
  python3 scripts/pinterest_image.py <hero_path> <headline> <badge_str> <subtitle> <output_path>

  badge_str: pipe-separated pill labels, e.g. "30 MIN|SERVES 4|BUDGET-FRIENDLY"
"""

import sys
from PIL import Image, ImageDraw, ImageFont

# ── Args ─────────────────────────────────────────────────────────────────────
hero_path   = sys.argv[1]
headline    = sys.argv[2].strip()
badge_str   = sys.argv[3].strip()
subtitle    = sys.argv[4].strip()
output_path = sys.argv[5]

badges = [b.strip() for b in badge_str.split('|') if b.strip()]


# ── Saliency-based smart crop ─────────────────────────────────────────────────
def smart_crop_rect(img):
    """
    Returns (left, top, crop_w, crop_h) of the most visually interesting
    2:3 rectangle inside img.  Falls back to centre-crop if analysis fails.

    New recipe images are generated at 2:3 natively by Replicate, so for
    those the saliency analysis is skipped (scale ≈ 1, no crop loss).
    """
    iw, ih = img.size
    out_w, out_h = 1000, 1500
    scale = min(iw / out_w, ih / out_h)
    cw = max(1, int(out_w * scale))
    ch = max(1, int(out_h * scale))

    # If the image is already very close to 2:3 (within 5%), skip saliency
    # and just do a simple centre-crop — nothing meaningful to gain.
    actual_ratio = iw / ih
    target_ratio = out_w / out_h  # 0.6667
    if abs(actual_ratio - target_ratio) / target_ratio < 0.05:
        left = max(0, (iw - cw) // 2)
        top  = max(0, (ih - ch) // 2)
        return left, top, cw, ch

    # Analyse a tiny thumbnail for speed
    aw = 60
    ah = max(1, int(ih * aw / iw))
    small = img.convert('L').resize((aw, ah), Image.LANCZOS)
    sw, sh = small.size
    px = list(small.getdata())

    def gp(x, y):
        return px[max(0, min(y, sh - 1)) * sw + max(0, min(x, sw - 1))]

    # Laplacian-like edge density per pixel → saliency
    sal = []
    for y in range(sh):
        row = []
        for x in range(sw):
            lap = abs(4 * gp(x, y)
                      - gp(x - 1, y) - gp(x + 1, y)
                      - gp(x, y - 1) - gp(x, y + 1))
            row.append(float(lap))
        sal.append(row)

    total = sum(v for row in sal for v in row) or 1.0

    # Centre of mass (scaled back to original image coords)
    cy_s = sum(y * sum(sal[y]) for y in range(sh)) / total
    cx_s = sum(x * sal[y][x] for y in range(sh) for x in range(sw)) / total

    cx = int(cx_s * iw / sw)
    cy = int(cy_s * ih / sh)

    # Clamp so the crop stays inside the image
    left = max(0, min(cx - cw // 2, iw - cw))
    top  = max(0, min(cy - ch // 2, ih - ch))

    return left, top, cw, ch


# ── 1. Load + smart-crop to 2:3 ──────────────────────────────────────────────
img = Image.open(hero_path).convert('RGB')
left, top, cw, ch = smart_crop_rect(img)
img = img.crop((left, top, left + cw, top + ch))
img = img.resize((1000, 1500), Image.LANCZOS)


# ── 2. Dark bottom card ───────────────────────────────────────────────────────
CARD_Y     = 920
CARD_COLOR = (22, 27, 34)
ACCENT     = (255, 183, 77)    # warm amber — pills + brand
TEXT_PRI   = (255, 255, 255)   # white headline
TEXT_SEC   = (200, 205, 210)   # light-grey subtitle / save hint
PILL_TXT   = (22, 27, 34)      # dark text on amber pill

card = Image.new('RGBA', (1000, 1500 - CARD_Y), CARD_COLOR + (255,))
img  = img.convert('RGBA')

# Feathered gradient above card so photo blends in cleanly
grad_h   = 160
gradient = Image.new('RGBA', (1000, grad_h), (0, 0, 0, 0))
gd       = ImageDraw.Draw(gradient)
for i in range(grad_h):
    alpha = int((i / grad_h) ** 1.4 * 240)
    gd.rectangle([(0, i), (1000, i + 1)], fill=CARD_COLOR + (alpha,))

img.paste(gradient, (0, CARD_Y - grad_h), gradient)
img.paste(card, (0, CARD_Y), card)
img  = img.convert('RGB')
draw = ImageDraw.Draw(img)


# ── 3. Fonts (macOS + Linux paths) ──────────────────────────────────────────
SERIF_BOLD = [
    '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
    '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
]
SANS_BOLD  = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
]
SANS_REG   = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
]

def load_font(paths, size):
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()

font_headline = load_font(SERIF_BOLD, 88)
font_pill     = load_font(SANS_BOLD,  30)
font_sub      = load_font(SANS_REG,   36)
font_brand    = load_font(SANS_BOLD,  32)


# ── 4. Badge pills ────────────────────────────────────────────────────────────
PILL_H   = 46
PILL_PAD = 22
PILL_R   = 10
PILL_GAP = 14
MARGIN   = 52

pill_y   = CARD_Y + 42
x_cursor = MARGIN
pill_data = []
for badge in badges[:4]:
    bb = draw.textbbox((0, 0), badge, font=font_pill)
    tw = bb[2] - bb[0]
    pw = tw + PILL_PAD * 2
    pill_data.append((x_cursor, badge, tw, pw))
    x_cursor += pw + PILL_GAP

for (px, badge, tw, pw) in pill_data:
    draw.rounded_rectangle(
        [(px, pill_y), (px + pw, pill_y + PILL_H)],
        radius=PILL_R, fill=ACCENT
    )
    tx = px + PILL_PAD
    bh = draw.textbbox((0, 0), badge, font=font_pill)[3]
    ty = pill_y + (PILL_H - bh) // 2
    draw.text((tx, ty), badge, fill=PILL_TXT, font=font_pill)


# ── 5. Headline ───────────────────────────────────────────────────────────────
MAX_W  = 920
HL_Y   = pill_y + PILL_H + 28
HL_LH  = 96

def wrap_text(text, font, max_w):
    words = text.split()
    lines, cur = [], []
    for word in words:
        trial = ' '.join(cur + [word])
        if draw.textbbox((0, 0), trial, font=font)[2] > max_w and cur:
            lines.append(' '.join(cur))
            cur = [word]
        else:
            cur.append(word)
    if cur:
        lines.append(' '.join(cur))
    return lines

hl_lines = wrap_text(headline, font_headline, MAX_W)[:3]
y = HL_Y
for line in hl_lines:
    # Soft shadow for legibility
    draw.text((MARGIN + 2, y + 2), line, fill=(0, 0, 0, 160), font=font_headline)
    draw.text((MARGIN, y),         line, fill=TEXT_PRI,        font=font_headline)
    y += HL_LH


# ── 6. Subtitle ───────────────────────────────────────────────────────────────
sub_y = y + 20
draw.text((MARGIN, sub_y), subtitle, fill=TEXT_SEC, font=font_sub)


# ── 7. Divider + brand foot ───────────────────────────────────────────────────
div_y   = sub_y + 56
draw.rectangle([(MARGIN, div_y), (1000 - MARGIN, div_y + 2)], fill=(60, 70, 80))

brand_y   = div_y + 16
brand_txt = 'ImprovOven.com'
save_txt  = 'Save this recipe \u2193'
draw.text((MARGIN, brand_y), brand_txt, fill=ACCENT, font=font_brand)
save_w = draw.textbbox((0, 0), save_txt, font=font_brand)[2]
draw.text((1000 - MARGIN - save_w, brand_y), save_txt, fill=TEXT_SEC, font=font_brand)


# ── 8. Save ───────────────────────────────────────────────────────────────────
img.save(output_path, 'JPEG', quality=93)
