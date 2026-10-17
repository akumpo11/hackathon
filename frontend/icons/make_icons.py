"""Draws the home screen icons: a mint coffee cup on the app's dark ink color.

Run from the repo root: python3 frontend/icons/make_icons.py
Draws once at 1024 px and shrinks, so the edges come out smooth.
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

INK = "#16201C"
MINT = "#17B890"
CANVAS = "#EEF1F0"
OUT = Path(__file__).parent


def drawIcon(size=1024):
    img = Image.new("RGB", (size, size), INK)
    d = ImageDraw.Draw(img)
    s = size / 1024
    # Everything sits inside the middle 70%, so Android's round "maskable" crop never cuts it.
    # Cup body
    d.rounded_rectangle([300 * s, 420 * s, 640 * s, 760 * s], radius=70 * s, fill=MINT)
    # Handle: a thick ring on the right side
    d.ellipse([570 * s, 480 * s, 760 * s, 670 * s], outline=MINT, width=int(48 * s))
    # Steam: three wavy lines above the cup, each one full sine wave tall.
    # Drawn as a trail of overlapping dots, which gives cleaner edges than a thick line.
    r = 13 * s
    for x in (390, 470, 550):
        for i in range(161):
            cx = (x + 18 * math.sin(2 * math.pi * i / 160)) * s
            cy = (380 - i) * s
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=CANVAS)
    return img


big = drawIcon()
for name, px in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
    big.resize((px, px), Image.LANCZOS).save(OUT / name)
