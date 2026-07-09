#!/usr/bin/env python3
"""
pinterest_image.py  —  ImprovOven Pinterest pin generator
1000 × 1500 portrait  |  text-at-top layout  |  3 distinct visual themes

Usage:
  python3 scripts/pinterest_image.py <hero> <headline> <badge_str> <subtitle> <output> [theme_idx]
  badge_str : pipe-separated, e.g. "30 MIN|SERVES 4|HIGH-PROTEIN"
  theme_idx : 0, 1, or 2  (default: derived from headline hash)

──────────────────────────────────────────────────────────────────────────────
Theme A — Warm Editorial
  Serif font (Georgia / DejaVuSerif-Bold), mixed-case headline, cream header,
  amber accent stripe. Feels like a food magazine spread.

Theme B — Bold Graphic
  Heavy sans-serif (Impact / DejaVuSans-Bold) ALL-CAPS. Thick coloured brand
  bar at the very top. White background. Outlined badge pills. Looks like a
  cookbook cover or a gym-nutrition graphic.

Theme C — Lifestyle Blog
  Rounded sans-serif (Trebuchet / LiberationSans), conversational mixed-case
  headline, warm linen header, burnt-amber pills. Feels like a food blogger's
  Instagram repost.
──────────────────────────────────────────────────────────────────────────────
"""

import sys
from PIL import Image, ImageDraw, ImageFont

# ── Args ──────────────────────────────────────────────────────────────────────
hero_path   = sys.argv[1]
headline    = sys.argv[2].strip()
badge_str   = sys.argv[3].strip()
subtitle    = sys.argv[4].strip()
output_path = sys.argv[5]
badges = [b.strip() for b in badge_str.split('|') if b.strip()]

# ── Theme index ───────────────────────────────────────────────────────────────
if len(sys.argv) > 6:
    THEME_IDX = int(sys.argv[6]) % 3
else:
    # Fallback: hash of headline
    THEME_IDX = sum(ord(c) * (i + 1) for i, c in enumerate(headline)) % 3

# ── Canvas dimensions ─────────────────────────────────────────────────────────
W = 1000
H = 1500

# ── Font paths ────────────────────────────────────────────────────────────────
SERIF_BOLD = [
    '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf',
]
SANS_HEAVY = [
    # Impact: ultra-condensed, instantly recognisable
    '/System/Library/Fonts/Supplemental/Impact.ttf',
    '/Library/Fonts/Impact.ttf',
    # Fallbacks for Linux CI
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]
SANS_ROUND = [
    # Trebuchet: friendly rounded sans
    '/System/Library/Fonts/Supplemental/Trebuchet MS Bold.ttf',
    '/Library/Fonts/Trebuchet MS Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]
SANS_REG = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
]
SANS_BOLD = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]

def load_font(paths, size):
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    print(f'⚠ Font fallback (size {size}): none of {[p.split("/")[-1] for p in paths]} found')
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()

# ── Saliency-crop helper ──────────────────────────────────────────────────────
def fit_and_crop(img, out_w, out_h):
    """Scale-to-fill then saliency-guided crop to out_w × out_h."""
    iw, ih = img.size
    scale = max(out_w / iw, out_h / ih)
    sw = max(1, int(iw * scale))
    sh = max(1, int(ih * scale))
    img = img.resize((sw, sh), Image.LANCZOS)

    if sw == out_w and sh == out_h:
        return img

    # Laplacian edge-density saliency
    aw, ah = 50, max(1, int(sh * 50 / sw))
    small = img.convert('L').resize((aw, ah), Image.LANCZOS)
    px = list(small.getdata())

    def gp(x, y):
        return px[max(0, min(y, ah-1)) * aw + max(0, min(x, aw-1))]

    total = 0.0
    cx_s = cy_s = 0.0
    for y in range(ah):
        for x in range(aw):
            v = float(abs(4*gp(x,y) - gp(x-1,y) - gp(x+1,y) - gp(x,y-1) - gp(x,y+1)))
            cx_s += x * v
            cy_s += y * v
            total += v
    if total:
        cx_s /= total
        cy_s /= total

    cx = int(cx_s * sw / aw)
    cy = int(cy_s * sh / ah)
    left = max(0, min(cx - out_w  // 2, sw - out_w))
    top  = max(0, min(cy - out_h // 2, sh - out_h))
    return img.crop((left, top, left + out_w, top + out_h))

def wrap(draw_obj, text, font, max_w):
    words = text.split()
    lines, cur = [], []
    for w in words:
        trial = ' '.join(cur + [w])
        if draw_obj.textbbox((0, 0), trial, font=font)[2] > max_w and cur:
            lines.append(' '.join(cur))
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(' '.join(cur))
    return lines

# ─────────────────────────────────────────────────────────────────────────────
# THEME A — Warm Editorial
# Layout: brand (small) → serif headline → amber pills → subtitle → stripe
# Header height 440 px, Georgia Bold headline ~86 px
# ─────────────────────────────────────────────────────────────────────────────
def render_theme_a(canvas, draw, photo, headline, badges, subtitle):
    MARGIN    = 52
    HEADER_H  = 440
    STRIPE_H  = 10
    PHOTO_Y   = HEADER_H + STRIPE_H

    HDR_BG    = (250, 246, 238)   # warm cream
    TEXT_COL  = (30, 16, 8)       # very dark brown
    ACCENT    = (220, 155, 40)    # amber
    PILL_BG   = (220, 155, 40)
    PILL_TEXT = (30, 16, 8)
    BRAND_COL = (140, 100, 45)

    HL_SIZE   = 86
    HL_LH     = 100
    MAX_HL_W  = W - MARGIN * 2

    # Header background
    draw.rectangle([(0, 0), (W, HEADER_H)], fill=HDR_BG)

    # Accent stripe
    draw.rectangle([(0, HEADER_H), (W, HEADER_H + STRIPE_H)], fill=ACCENT)

    # Photo
    canvas.paste(photo, (0, PHOTO_Y))

    font_hl    = load_font(SERIF_BOLD, HL_SIZE)
    font_pill  = load_font(SANS_BOLD, 30)
    font_sub   = load_font(SANS_REG, 33)
    font_brand = load_font(SANS_BOLD, 25)

    # Brand line
    draw.text((MARGIN, 22), 'IMPROV OVEN  ·  ImprovOven.com',
              fill=BRAND_COL, font=font_brand)

    # Headline (max 2 lines; shrink if needed)
    hl_lines = wrap(draw, headline, font_hl, MAX_HL_W)
    if len(hl_lines) > 2:
        font_sm = load_font(SERIF_BOLD, int(HL_SIZE * 0.82))
        sm_lines = wrap(draw, headline, font_sm, MAX_HL_W)
        if len(sm_lines) <= 2:
            font_hl = font_sm
            hl_lines = sm_lines
            HL_LH = int(HL_SIZE * 0.82 * 1.15)
        else:
            hl_lines = hl_lines[:2]

    y = 68
    for line in hl_lines:
        draw.text((MARGIN, y), line, fill=TEXT_COL, font=font_hl)
        y += HL_LH

    # Filled badge pills
    PILL_H, PILL_PAD, PILL_R, PILL_GAP = 42, 18, 8, 10
    py = y + 24
    x = MARGIN
    for badge in badges[:4]:
        bb = draw.textbbox((0,0), badge, font=font_pill)
        tw = bb[2] - bb[0]
        pw = tw + PILL_PAD * 2
        if x + pw > W - MARGIN:
            break
        draw.rounded_rectangle([(x, py), (x+pw, py+PILL_H)], radius=PILL_R, fill=PILL_BG)
        bh = bb[3] - bb[1]
        draw.text((x + PILL_PAD, py + (PILL_H - bh)//2), badge,
                  fill=PILL_TEXT, font=font_pill)
        x += pw + PILL_GAP

    # Subtitle
    draw.text((MARGIN, py + PILL_H + 16), subtitle, fill=BRAND_COL, font=font_sub)


# ─────────────────────────────────────────────────────────────────────────────
# THEME B — Bold Graphic
# Layout: thick brand bar (top 72px) → ALL-CAPS heavy headline → outlined pills
# White header, deep green bar + outline pills. Cookbook-cover energy.
# Header height 400 px; Impact/heavy sans ~90 px
# ─────────────────────────────────────────────────────────────────────────────
def render_theme_b(canvas, draw, photo, headline, badges, subtitle):
    MARGIN    = 52
    BAR_H     = 72    # thick brand bar
    HEADER_H  = 400
    STRIPE_H  = 10
    PHOTO_Y   = HEADER_H + STRIPE_H

    BAR_COL   = (20, 58, 40)      # deep forest green
    HDR_BG    = (255, 255, 255)   # pure white
    TEXT_COL  = (20, 58, 40)      # same deep green for text
    ACCENT    = (52, 168, 110)    # medium green stripe
    PILL_OUT  = (20, 58, 40)      # outlined pill border
    PILL_TEXT = (20, 58, 40)
    BRAND_COL = (255, 255, 255)   # white text on bar

    HL_SIZE   = 90
    HL_LH     = 104
    MAX_HL_W  = W - MARGIN * 2

    # Header background (white)
    draw.rectangle([(0, 0), (W, HEADER_H)], fill=HDR_BG)

    # Brand bar (thick green strip)
    draw.rectangle([(0, 0), (W, BAR_H)], fill=BAR_COL)

    # Accent stripe at bottom of header
    draw.rectangle([(0, HEADER_H), (W, HEADER_H + STRIPE_H)], fill=ACCENT)

    # Photo
    canvas.paste(photo, (0, PHOTO_Y))

    font_bar   = load_font(SANS_BOLD, 34)
    font_hl    = load_font(SANS_HEAVY, HL_SIZE)
    font_pill  = load_font(SANS_BOLD, 28)
    font_sub   = load_font(SANS_REG, 30)

    # Brand text in white inside bar
    brand_bb = draw.textbbox((0,0), 'IMPROV OVEN', font=font_bar)
    bh = brand_bb[3] - brand_bb[1]
    draw.text((MARGIN, (BAR_H - bh)//2), 'IMPROV OVEN',
              fill=BRAND_COL, font=font_bar)

    # Website right-aligned in bar
    site_txt = 'ImprovOven.com'
    site_bb  = draw.textbbox((0,0), site_txt, font=font_sub)
    draw.text((W - MARGIN - (site_bb[2]-site_bb[0]),
               (BAR_H - (site_bb[3]-site_bb[1]))//2),
              site_txt, fill=(200, 230, 215), font=font_sub)

    # ALL-CAPS headline (max 2 lines)
    hl_lines = wrap(draw, headline, font_hl, MAX_HL_W)
    if len(hl_lines) > 2:
        font_sm = load_font(SANS_HEAVY, int(HL_SIZE * 0.80))
        sm_lines = wrap(draw, headline, font_sm, MAX_HL_W)
        if len(sm_lines) <= 2:
            font_hl = font_sm
            hl_lines = sm_lines
            HL_LH = int(HL_SIZE * 0.80 * 1.15)
        else:
            hl_lines = hl_lines[:2]

    y = BAR_H + 28
    for line in hl_lines:
        draw.text((MARGIN, y), line, fill=TEXT_COL, font=font_hl)
        y += HL_LH

    # Outlined (border-only) badge pills
    PILL_H, PILL_PAD, PILL_R, PILL_GAP = 40, 16, 6, 10
    py = y + 20
    x = MARGIN
    for badge in badges[:4]:
        bb = draw.textbbox((0,0), badge, font=font_pill)
        tw = bb[2] - bb[0]
        pw = tw + PILL_PAD * 2
        if x + pw > W - MARGIN:
            break
        draw.rounded_rectangle([(x, py), (x+pw, py+PILL_H)],
                                radius=PILL_R, outline=PILL_OUT, width=2)
        bh = bb[3] - bb[1]
        draw.text((x + PILL_PAD, py + (PILL_H - bh)//2), badge,
                  fill=PILL_TEXT, font=font_pill)
        x += pw + PILL_GAP

    # Subtitle
    draw.text((MARGIN, py + PILL_H + 14), subtitle,
              fill=(90, 130, 110), font=font_sub)


# ─────────────────────────────────────────────────────────────────────────────
# THEME C — Lifestyle Blog
# Layout: headline first (large, at top), then pills, then brand footer line
# Warm linen header, Trebuchet/rounded sans, burnt-amber accent + pills.
# Header height 470 px; gives more room for longer conversational headlines.
# ─────────────────────────────────────────────────────────────────────────────
def render_theme_c(canvas, draw, photo, headline, badges, subtitle):
    MARGIN    = 52
    HEADER_H  = 470
    STRIPE_H  = 10
    PHOTO_Y   = HEADER_H + STRIPE_H

    HDR_BG    = (243, 237, 226)   # warm linen
    TEXT_COL  = (25, 23, 20)      # near-black
    ACCENT    = (196, 112, 20)    # burnt amber
    PILL_BG   = (196, 112, 20)
    PILL_TEXT = (255, 255, 255)
    BRAND_COL = (110, 90, 55)

    HL_SIZE   = 80
    HL_LH     = 92
    MAX_HL_W  = W - MARGIN * 2

    # Header background
    draw.rectangle([(0, 0), (W, HEADER_H)], fill=HDR_BG)

    # Accent stripe
    draw.rectangle([(0, HEADER_H), (W, HEADER_H + STRIPE_H)], fill=ACCENT)

    # Photo
    canvas.paste(photo, (0, PHOTO_Y))

    font_hl    = load_font(SANS_ROUND, HL_SIZE)
    font_pill  = load_font(SANS_BOLD, 30)
    font_sub   = load_font(SANS_REG, 31)
    font_brand = load_font(SANS_BOLD, 22)

    # Thin accent divider accent line at top of header (not a full bar)
    draw.rectangle([(MARGIN, 20), (W - MARGIN, 24)], fill=ACCENT)

    # Headline starts right below divider
    hl_lines = wrap(draw, headline, font_hl, MAX_HL_W)
    if len(hl_lines) > 3:
        font_sm = load_font(SANS_ROUND, int(HL_SIZE * 0.84))
        sm_lines = wrap(draw, headline, font_sm, MAX_HL_W)
        if len(sm_lines) <= 3:
            font_hl = font_sm
            hl_lines = sm_lines
            HL_LH = int(HL_SIZE * 0.84 * 1.15)
        else:
            hl_lines = hl_lines[:3]

    y = 38
    for line in hl_lines:
        draw.text((MARGIN, y), line, fill=TEXT_COL, font=font_hl)
        y += HL_LH

    # Filled amber pills
    PILL_H, PILL_PAD, PILL_R, PILL_GAP = 44, 18, 22, 10
    py = y + 22
    x = MARGIN
    for badge in badges[:4]:
        bb = draw.textbbox((0,0), badge, font=font_pill)
        tw = bb[2] - bb[0]
        pw = tw + PILL_PAD * 2
        if x + pw > W - MARGIN:
            break
        draw.rounded_rectangle([(x, py), (x+pw, py+PILL_H)], radius=PILL_R, fill=PILL_BG)
        bh = bb[3] - bb[1]
        draw.text((x + PILL_PAD, py + (PILL_H - bh)//2), badge,
                  fill=PILL_TEXT, font=font_pill)
        x += pw + PILL_GAP

    # Brand at bottom of header
    brand_y = py + PILL_H + 18
    draw.text((MARGIN, brand_y), 'IMPROV OVEN  ·  ' + subtitle.split('·')[-1].strip(),
              fill=BRAND_COL, font=font_brand)
    draw.text((MARGIN, brand_y + 28), subtitle.split('·')[0].strip(),
              fill=BRAND_COL, font=font_sub)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
raw = Image.open(hero_path).convert('RGB')

# Determine photo dimensions for this theme
HEADER_SIZES = {0: 440 + 10, 1: 400 + 10, 2: 470 + 10}
PHOTO_Y      = HEADER_SIZES[THEME_IDX]
PHOTO_H      = H - PHOTO_Y

photo = fit_and_crop(raw, W, PHOTO_H)

canvas = Image.new('RGB', (W, H), (255, 255, 255))
draw   = ImageDraw.Draw(canvas)

if THEME_IDX == 0:
    render_theme_a(canvas, draw, photo, headline, badges, subtitle)
elif THEME_IDX == 1:
    render_theme_b(canvas, draw, photo, headline, badges, subtitle)
else:
    render_theme_c(canvas, draw, photo, headline, badges, subtitle)

canvas.save(output_path, 'JPEG', quality=93)
