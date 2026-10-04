"""Regenerates the brand images that can't be CSS: public/email-lockup.png
(light, for emails) and public/og-image.png (dark, social preview).

Wordmark = the site's steel look (flat steel face, navy stepped depth, soft
shadow, thin rim); tagline = same width as the wordmark, like the site,
PDF and emails everywhere else.

Usage: python3 scripts/make-brand-assets.py <Syne-ExtraBold.ttf> <Inter-600.ttf>
(Inter 600: npm pack @fontsource/inter, convert the latin-600 woff2 to ttf.)
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SYNE, INTER = sys.argv[1], sys.argv[2]
TAG = 'LEARN. PRACTICE. IMPROVE.'


def text_mask(size, text, font, xy):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).text(xy, text, font=font, fill=255)
    return m


def stamp(canvas, mask, color, dx, dy, alpha=1.0):
    layer = Image.new('RGBA', canvas.size, color + (0,))
    a = mask.point(lambda v: int(v * alpha))
    layer.putalpha(a)
    shifted = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    shifted.alpha_composite(layer, (int(round(dx)), int(round(dy))) if dx >= 0 and dy >= 0 else (0, 0))
    if dx < 0 or dy < 0:
        shifted = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        shifted.paste(layer, (int(round(dx)), int(round(dy))))
    canvas.alpha_composite(shifted)


def wordmark(canvas, x, y, font, scale, theme):
    """Draw 'Med101' with the site's layered emboss. scale = px per CSS px."""
    mask = text_mask(canvas.size, 'Med101', font, (x, y))
    s = scale
    if theme == 'light':
        steps = [  # drawn back to front, mirrors tokens.css light-mode text-shadow
            ((12, 28, 48), 3.5, 3.5, 0.30, 5), ((30, 58, 95), 2.5, 2.5, 1, 0),
            ((30, 58, 95), 1.5, 1.5, 1, 0), ((255, 255, 255), -1, -1, 0.9, 0),
            ((81, 100, 125), 0.6, 0.6, 1, 0)]
    else:
        steps = [  # dark-mode stack: dark depth, white rim at 30%, grey-steel face
            ((0, 0, 0), 3, 3, 0.40, 6), ((0, 0, 0), 2, 2, 0.7, 0), ((0, 0, 0), 1, 1, 0.7, 0),
            ((255, 255, 255), -1, -1, 0.35, 0), ((104, 118, 140), 0.0, 0.0, 1, 0)]
    for color, dx, dy, alpha, blur in steps:
        m = mask.filter(ImageFilter.GaussianBlur(blur * s)) if blur else mask
        stamp(canvas, m, color, dx * s, dy * s, alpha)


def tagline(canvas, x, y, width, font, color):
    """Tagline whose visible width equals `width` exactly."""
    advances = [font.getlength(c) for c in TAG]
    extra = (width - sum(advances)) / (len(TAG) - 1)
    d = ImageDraw.Draw(canvas)
    cx = x
    for c, a in zip(TAG, advances):
        d.text((cx, y), c, font=font, fill=color)
        cx += a + extra


def ink_bbox(font, text):
    return font.getbbox(text)


# ---------- email lockup (light) ----------
S = 4  # 4x of the 132px display width -> sharp on retina
W_CSS = 132
size_syne = 100
f_syne = ImageFont.truetype(SYNE, size_syne)
bb = f_syne.getbbox('Med101')
mark_w, mark_h = bb[2] - bb[0], bb[3] - bb[1]
target_w = W_CSS * S
k = target_w / mark_w
f_syne = ImageFont.truetype(SYNE, int(size_syne * k))
bb = f_syne.getbbox('Med101')
mark_w, mark_h = bb[2] - bb[0], bb[3] - bb[1]
pad = 10
tag_size = int(int(size_syne * k) * 0.34)  # a bit smaller than the site's 8/19 so the fitted tracking stays open
f_tag = ImageFont.truetype(INTER, tag_size)
canvas = Image.new('RGBA', (mark_w + pad * 2, mark_h + pad + int(tag_size * 2.4) + pad), (0, 0, 0, 0))
wordmark(canvas, pad - bb[0], pad - bb[1], f_syne, S * (mark_h / (19 * S * 0.72)) / 4 * 0 + mark_h / 28, 'light')
tagline(canvas, pad, pad + mark_h + int(tag_size * 0.55), mark_w, f_tag, (79, 100, 124, 255))
canvas = canvas.crop(canvas.getbbox())
canvas.save('public/email-lockup.png', optimize=True)
print('email-lockup', canvas.size)

# ---------- OG image (dark) ----------
W, H = 1200, 630
og = Image.new('RGBA', (W, H), (5, 5, 5, 255))
glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse((150, 40, 1050, 560), fill=(30, 58, 95, 120))
og.alpha_composite(glow.filter(ImageFilter.GaussianBlur(120)))
size = 150
f = ImageFont.truetype(SYNE, size)
bb = f.getbbox('Med101')
mw, mh = bb[2] - bb[0], bb[3] - bb[1]
x0 = (W - mw) // 2
y0 = 175
wordmark(og, x0 - bb[0], y0 - bb[1], f, 3.2, 'dark')
f_t = ImageFont.truetype(INTER, int(size * 0.32))
tagline(og, x0, y0 + mh + 26, mw, f_t, (138, 174, 208, 255))
f_d = ImageFont.truetype(INTER, 27)
desc = 'Medical exam prep: Physiology, Biochemistry, Anatomy and more'
dl = ImageDraw.Draw(og).textlength(desc, font=f_d)
ImageDraw.Draw(og).text(((W - dl) / 2, y0 + mh + 120), desc, font=f_d, fill=(192, 212, 240, 255))
ImageDraw.Draw(og).rounded_rectangle((W / 2 - 80, y0 + mh + 185, W / 2 + 80, y0 + mh + 190), 3, fill=(74, 111, 148, 255))
og.convert('RGB').save('public/og-image.png', optimize=True)
print('og-image', og.size)
