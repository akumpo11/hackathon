"""Draws the DeCaf logo: a coffee-brown cup whose steam is the caffeine curve
(a quick rise after the sip, then half-life decay), on the coffee theme's dark bezel color.

Writes logo.svg / logo-light.svg (vector, for the README and web page) and the PNG home
screen icons. Run from the repo root: python3 frontend/icons/make_icons.py
The PNGs are drawn once at 1024 px and shrunk, so the edges come out smooth.
"""
from pathlib import Path

from PIL import Image, ImageDraw

BEZEL = "#2A211B"    # coffee theme --frame: the dark tile behind the cup
BROWN = "#A0673A"    # coffee theme --accent: the cup
CANVAS = "#F1EEEB"   # coffee theme --canvas: steam on the dark tile
INK = "#16201C"      # --ink: steam on the light tile
OUT = Path(__file__).parent

# Everything is laid out on a 240 x 240 grid, the same numbers the SVG uses, and scaled to fit.
# The cup sits in the middle 70% so Android's round "maskable" crop never cuts it.
CUP = (48, 112, 158, 196)                           # left, top, right, bottom
CUP_RADIUS = 20
HANDLE_CENTER, HANDLE_R, HANDLE_W = (170, 154), 24, 15
# Steam as a cubic Bezier chain: straight up from the rim, over a peak, then decaying to the right.
STEAM = [(62, 96), (72, 54), (78, 36), (90, 44), (98, 62), (114, 94), (150, 92), (176, 92)]
STEAM_W = 10


def svgLogo(tile, steam):
    """The logo as SVG text. tile is the background, steam the curve color."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">'
        f'<rect width="240" height="240" rx="56" fill="{tile}"/>'
        f'<rect x="{CUP[0]}" y="{CUP[1]}" width="{CUP[2]-CUP[0]}" height="{CUP[3]-CUP[1]}" rx="{CUP_RADIUS}" fill="{BROWN}"/>'
        f'<path d="M158 130 h12 a24 24 0 0 1 0 48 h-12" fill="none" stroke="{BROWN}" stroke-width="{HANDLE_W}" stroke-linecap="round"/>'
        '<path d="M62 96 L72 54 C78 36 90 44 98 62 C114 94 150 92 176 92" fill="none" '
        f'stroke="{steam}" stroke-width="{STEAM_W}" stroke-linecap="round" stroke-linejoin="round"/>'
        '</svg>'
    )


def bezier(p0, p1, p2, p3, n=80):
    """Points along one cubic Bezier segment."""
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def steamPoints():
    (x0, y0), (x1, y1) = STEAM[0], STEAM[1]                      # the straight rise, as dots too
    pts = [(x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * i / 20) for i in range(21)]
    pts += bezier(STEAM[1], STEAM[2], STEAM[3], STEAM[4])        # over the peak
    pts += bezier(STEAM[4], STEAM[5], STEAM[6], STEAM[7])        # the decay
    return pts


def drawIcon(size=1024, tile=BEZEL, steam=CANVAS):
    img = Image.new("RGB", (size, size), tile)
    d = ImageDraw.Draw(img)
    s = size / 240
    d.rounded_rectangle([CUP[0] * s, CUP[1] * s, CUP[2] * s, CUP[3] * s], radius=CUP_RADIUS * s, fill=BROWN)
    # Handle: the right half of a ring, plus straight stubs joining it to the cup.
    # PIL draws an arc's width inward from the box, so the box uses the ring's outer edge (R + W/2).
    cx, cy = HANDLE_CENTER
    ro = HANDLE_R + HANDLE_W / 2
    box = [(cx - ro) * s, (cy - ro) * s, (cx + ro) * s, (cy + ro) * s]
    d.arc(box, start=-90, end=90, fill=BROWN, width=round(HANDLE_W * s))
    d.rectangle([158 * s, (cy - HANDLE_R - HANDLE_W / 2) * s, cx * s, (cy - HANDLE_R + HANDLE_W / 2) * s], fill=BROWN)
    d.rectangle([158 * s, (cy + HANDLE_R - HANDLE_W / 2) * s, cx * s, (cy + HANDLE_R + HANDLE_W / 2) * s], fill=BROWN)
    # Steam: a trail of overlapping dots along the curve, which gives cleaner edges than a thick line
    r = STEAM_W / 2 * s
    for x, y in steamPoints():
        d.ellipse([x * s - r, y * s - r, x * s + r, y * s + r], fill=steam)
    return img


(OUT / "logo.svg").write_text(svgLogo(BEZEL, CANVAS))
(OUT / "logo-light.svg").write_text(svgLogo(CANVAS, INK))
big = drawIcon()
for name, px in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
    big.resize((px, px), Image.LANCZOS).save(OUT / name)
big.resize((512, 512), Image.LANCZOS).save("/tmp/decaf-icon-check.png")
