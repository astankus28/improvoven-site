#!/usr/bin/env python3
"""
pinterest_image.py  —  ImprovOven Pinterest pin generator

Layout (1000 × 1500):
  ┌────────────────────────────────┐
  │  Brand tag                     │  ← small, top of header
  │                                │
  │  Hook headline (1–2 lines)     │  ← large bold text
  │                                │
  │  [30 MIN]  [SERVES 4]  [...]   │  ← badge pills
  │                                │
  │  Cuisine · ImprovOven.com      │  ← small subtitle
  ├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┤  ← 10px accent stripe
  │                                │
  │       food photo (fills        │
  │       the bottom ~72%)         │
  │                                │
  └────────────────────────────────┘

Research-backed design decisions:
  • Text at TOP, photo at bottom — matches top-performing food pins
  • Light header background + dark text — outperforms dark/white on mobile
  • 3 rotating style themes (by slug hash) — satisfies Pinterest's 2026
    "freshness" requirement (different font/colour scheme = new content)
  • Headline font 80–90pt, readable at 200px thumbnail width
  • Specific hook copy with numbers, dietary callouts, time claims

Usage:
  python3 scripts/pinterest_image.py <hero> <headline> <badge_str> <subtitle> <output>
  badge_str: pipe-separated, e.g. "30 MIN|SERVES 4|HIGH-PROTEIN"
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

# ── Canvas ────────────────────────────────────────────────────────────────────
W, H         = 1000, 1500
HEADER_H     = 430   # header block height (top ~28.7%)
STRIPE_H     = 10    # accent stripe between header and photo
PHOTO_Y      = HEADER_H + STRIPE_H   # = 440
PHOTO_H      = H - PHOTO_Y           # = 1060
MARGIN       = 52

# ── 3 rotating style themes ───────────────────────────────────────────────────
# Rotated by hash of the headline so each recipe gets a consistent style
# but neighbouring recipes in a board look visually distinct.
THEMES = [
    {   # A — Warm Editorial: cream header, dark brown text, amber accent
        'header_bg':  (250, 246, 238),
        'text':       (30, 16, 8),
        'accent':     (220, 155, 40),
        'pill_bg':    (220, 155, 40),
        'pill_text':  (30, 16, 8),
        'brand':      (140, 100, 45),
        'serif':      True,
        'hl_size':    84,
    },
    {   # B — Fresh Green: white header, deep-green text, green accent
        'header_bg':  (255, 255, 255),
        'text':       (20, 58, 40),
        'accent':     (52, 168, 110),
        'pill_bg':    (20, 58, 40),
        'pill_text':  (255, 255, 255),
        'brand':      (80, 130, 100),
        'serif':      False,
        'hl_size':    88,
    },
    {   # C — Modern Linen: warm off-white, near-black text, burnt-amber accent
        'header_bg':  (243, 238, 228),
        'text':       (25, 23, 20),
        'accent':     (196, 112, 20),
        'pill_bg':    (196, 112, 20),
        'pill_text':  (255, 255, 255),
        'brand':      (110, 90, 60),
        'serif':      True,
        'hl_size':    82,
    },
]

# Pick theme deterministically from headline text
_hash = sum(ord(c) * (i + 1) for i, c in enumerate(headline)) % len(THEMES)
T = THEMES[_hash]

# ── Font loading ──────────────────────────────────────────────────────────────
SERIF_BOLD = [
    '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf',
]
SANS_BOLD = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Supplemental/Trebuchet MS Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
]
SANS_REG = [
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
    print(f'⚠ Font fallback for size {size} (none of {[p.split("/")[-1] for p in paths]} found)')
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()

HEADLINE_PATHS = SERIF_BOLD if T['serif'] else SANS_BOLD
font_hl    = load_font(HEADLINE_PATHS, T['hl_size'])
font_pill  = load_font(SANS_BOLD, 30)
font_sub   = load_font(SANS_REG, 34)
font_brand = load_font(SANS_BOLD, 26)

# ── Photo: scale + smart-crop to fill photo area ──────────────────────────────
def find_saliency_center(img, out_w, out_h):
    """Laplacian edge density → centre of visual mass."""
    aw = 50
    ah = max(1, int(img.height * aw / img.width))
    small = img.convert('L').resize((aw, ah), Image.LANCZOS)
    px = list(small.getdata())

    def gp(x, y):
        return px[max(0, min(y, ah-1)) * aw + max(0, min(x, aw-1))]

    sal = []
    for y in range(ah):
        row = []
        for x in range(aw):
            lap = abs(4*gp(x,y) - gp(x-1,y) - gp(x+1,y) - gp(x,y-1) - gp(x,y+1))
            row.append(float(lap))
        sal.append(row)

    total = sum(v for r in sal for v in r) or 1.0
    cy_s = sum(y * sum(sal[y]) for y in range(ah)) / total
    cx_s = sum(x * sal[y][x] for y in range(ah) for x in range(aw)) / total

    scale_x = img.width  / aw
    scale_y = img.height / ah
    cx = int(cx_s * scale_x)
    cy = int(cy_s * scale_y)

    left = max(0, min(cx - out_w // 2, img.width  - out_w))
    top  = max(0, min(cy - out_h // 2, img.height - out_h))
    return left, top

raw = Image.open(hero_path).convert('RGB')
iw, ih = raw.size
scale = max(W / iw, PHOTO_H / ih)
sw = max(1, int(iw * scale))
sh = max(1, int(ih * scale))
scaled = raw.resize((sw, sh), Image.LANCZOS)

if sw == W and sh == PHOTO_H:
    photo = scaled
else:
    left, top = find_saliency_center(scaled, W, PHOTO_H)
    photo = scaled.crop((left, top, left + W, top + PHOTO_H))

# ── Canvas assembly ───────────────────────────────────────────────────────────
canvas = Image.new('RGB', (W, H), T['header_bg'])
canvas.paste(photo, (0, PHOTO_Y))

# Accent stripe
stripe = Image.new('RGB', (W, STRIPE_H), T['accent'])
canvas.paste(stripe, (0, HEADER_H))

draw = ImageDraw.Draw(canvas)

# ── Header content ────────────────────────────────────────────────────────────

# 1. Brand tag (top-left)
brand_text = 'IMPROV OVEN  ·  ImprovOven.com'
draw.text((MARGIN, 22), brand_text, fill=T['brand'], font=font_brand)

# 2. Headline (wraps to max 2 lines; shrink font if needed)
MAX_HL_W   = W - MARGIN * 2
HL_LINE_H  = int(T['hl_size'] * 1.15)
HL_Y_START = 72

def wrap(text, font, max_w):
    words = text.split()
    lines, cur = [], []
    for w in words:
        trial = ' '.join(cur + [w])
        if draw.textbbox((0,0), trial, font=font)[2] > max_w and cur:
            lines.append(' '.join(cur)); cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(' '.join(cur))
    return lines

hl_lines = wrap(headline, font_hl, MAX_HL_W)
if len(hl_lines) > 2:
    # Try 15% smaller before hard-wrapping to 2 lines
    font_hl_sm = load_font(HEADLINE_PATHS, int(T['hl_size'] * 0.84))
    hl_sm = wrap(headline, font_hl_sm, MAX_HL_W)
    if len(hl_sm) <= 2:
        font_hl   = font_hl_sm
        hl_lines  = hl_sm
        HL_LINE_H = int(T['hl_size'] * 0.84 * 1.15)
    else:
        hl_lines = hl_lines[:2]

y = HL_Y_START
for line in hl_lines:
    draw.text((MARGIN, y), line, fill=T['text'], font=font_hl)
    y += HL_LINE_H

# 3. Badge pills
PILL_H   = 44
PILL_PAD = 20
PILL_R   = 8
PILL_GAP = 12
PILLS_Y  = y + 28
MAX_PILL_X = W - MARGIN

x = MARGIN
pill_data = []
for badge in badges[:4]:
    bb = draw.textbbox((0,0), badge, font=font_pill)
    tw = bb[2] - bb[0]
    pw = tw + PILL_PAD * 2
    if x + pw > MAX_PILL_X:
        break
    pill_data.append((x, badge, tw, pw))
    x += pw + PILL_GAP

for (px, badge, tw, pw) in pill_data:
    draw.rounded_rectangle([(px, PILLS_Y), (px+pw, PILLS_Y+PILL_H)],
                            radius=PILL_R, fill=T['pill_bg'])
    bh = draw.textbbox((0,0), badge, font=font_pill)[3]
    ty = PILLS_Y + (PILL_H - bh) // 2
    draw.text((px + PILL_PAD, ty), badge, fill=T['pill_text'], font=font_pill)

# 4. Subtitle line
sub_y = PILLS_Y + PILL_H + 18
draw.text((MARGIN, sub_y), subtitle, fill=T['brand'], font=font_sub)

# ── Save ──────────────────────────────────────────────────────────────────────
canvas.save(output_path, 'JPEG', quality=93)
