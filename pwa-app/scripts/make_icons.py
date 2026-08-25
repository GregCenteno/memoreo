"""Generate brand app icons for Memoreo (deep turquoise + raspberry magenta, document motif)."""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)

BRAND = (14, 165, 166, 255)      # #0EA5A6 deep turquoise
BRAND_DARK = (7, 94, 92, 255)    # #075E5C
PAPER = (255, 255, 255, 255)     # crisp white
ACCENT = (199, 19, 104, 255)     # #C71368 raspberry magenta


def rounded_square(size, radius_ratio, fill):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=fill)
    return img


def draw_glyph(img, size, safe_ratio):
    """Draw a simple folded-document glyph centered within the safe zone."""
    d = ImageDraw.Draw(img)
    safe = size * safe_ratio
    margin = (size - safe) / 2

    doc_w = safe * 0.62
    doc_h = safe * 0.78
    x0 = size / 2 - doc_w / 2
    y0 = margin + (safe - doc_h) / 2
    x1 = x0 + doc_w
    y1 = y0 + doc_h
    fold = doc_w * 0.34

    # document body (parchment) with a folded corner
    d.polygon(
        [
            (x0, y0), (x1 - fold, y0), (x1, y0 + fold), (x1, y1), (x0, y1),
        ],
        fill=PAPER,
    )
    # folded corner triangle in amber
    d.polygon(
        [(x1 - fold, y0), (x1, y0 + fold), (x1 - fold, y0 + fold)],
        fill=ACCENT,
    )
    # text lines
    line_w = int(max(2, size * 0.018))
    lx0 = x0 + doc_w * 0.16
    lx1 = x1 - doc_w * 0.16
    ly1 = y0 + doc_h * 0.52
    ly2 = y0 + doc_h * 0.68
    ly3 = y0 + doc_h * 0.84
    d.line([(lx0, ly1), (lx1, ly1)], fill=BRAND, width=line_w)
    d.line([(lx0, ly2), (lx1 - doc_w * 0.18, ly2)], fill=BRAND, width=line_w)
    d.line([(lx0, ly3), (lx1 - doc_w * 0.30, ly3)], fill=BRAND, width=line_w)

    # small reminder dot (amber) top-left of doc, like a bookmark/alert
    dot_r = size * 0.045
    dcx, dcy = x0 + doc_w * 0.10, y0 - dot_r * 0.2
    d.ellipse([dcx - dot_r, dcy - dot_r, dcx + dot_r, dcy + dot_r], fill=ACCENT)


def make_icon(size, safe_ratio, radius_ratio, path):
    img = rounded_square(size, radius_ratio, BRAND)
    draw_glyph(img, size, safe_ratio)
    img.save(path)


# Standard "any" icons (rounded square, glyph fills most of canvas)
make_icon(192, 0.86, 0.22, os.path.join(OUT, "icon-192.png"))
make_icon(512, 0.86, 0.22, os.path.join(OUT, "icon-512.png"))

# Maskable icons need extra safe padding (~80% safe zone, square/no visual clipping issues)
make_icon(192, 0.62, 0.0, os.path.join(OUT, "maskable-192.png"))
make_icon(512, 0.62, 0.0, os.path.join(OUT, "maskable-512.png"))

# Apple touch icon (no transparency, slightly rounded is handled by iOS itself)
make_icon(180, 0.86, 0.0, os.path.join(OUT, "apple-touch-icon.png"))

print("icons written to", OUT)
