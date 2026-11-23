"""Generate the app icon, adaptive icon layers, PWA icons and splash screens.

Source artwork: assets/character.jpg (user-supplied illustration).
The illustration has a white background with a thin dark scan border; we crop
that border, flood-fill only the connected white background (so the white apron
and ruffles stay intact), then compose the character onto soft gradient plates.

Run with the bundled Python:
  python scripts/make-icon-assets.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
GENERATED = ASSETS / "generated"
PUBLIC_ICONS = ROOT / "public" / "icons"
SOURCE = ASSETS / "character.jpg"
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")

# The source scan has a dark border on top and another image strip at right.
CROP = (0, 13, 1265, 1288)


def remove_white_background(image: Image.Image) -> Image.Image:
    """Flood-fill the white background connected to the border, keeping white fill areas."""
    rgb = np.array(image.convert("RGB"))
    mask = Image.fromarray(
        np.where(rgb.min(axis=2) > 225, 255, 0).astype("uint8"), "L"
    ).copy()
    ImageDraw.floodfill(mask, (0, 0), 128, thresh=30)
    alpha = np.where(np.array(mask) == 128, 0, 255).astype("uint8")
    rgba = np.dstack([rgb, alpha])
    return Image.fromarray(rgba, "RGBA")


def gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int],
             glow: tuple[int, int, int], glow_alpha: float = 0.55) -> Image.Image:
    y, x = np.mgrid[0:size, 0:size]
    t = (x + y) / (2 * (size - 1))
    arr = np.empty((size, size, 3), dtype=np.float32)
    for c in range(3):
        arr[..., c] = top[c] + (bottom[c] - top[c]) * t

    # Soft light behind the character, slightly above center.
    cx, cy = size * 0.50, size * 0.43
    radius = size * 0.62
    dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / radius
    a = np.clip(1 - dist, 0, 1) ** 2 * glow_alpha
    for c in range(3):
        arr[..., c] = arr[..., c] * (1 - a) + glow[c] * a

    return Image.fromarray(np.clip(arr, 0, 255).astype("uint8"), "RGB")


def fit_height(image: Image.Image, height: int) -> Image.Image:
    width = round(image.width * height / image.height)
    return image.resize((width, height), Image.LANCZOS)


def compose_character(background: Image.Image, character: Image.Image, height: int,
                      y_offset: int = 0) -> Image.Image:
    canvas = background.convert("RGBA")
    art = fit_height(character, height)
    x = (canvas.width - art.width) // 2
    y = (canvas.height - art.height) // 2 + y_offset
    canvas.alpha_composite(art, (x, y))
    return canvas


def write_icon_set(character: Image.Image) -> None:
    GENERATED.mkdir(parents=True, exist_ok=True)

    # Legacy / PWA icon: character inside the launcher's mask safe area.
    icon_bg = gradient(1024, (234, 243, 255), (203, 221, 255), (255, 255, 255), 0.75)
    icon = compose_character(icon_bg, character, 800)
    icon.convert("RGB").save(GENERATED / "icon-1024.png", optimize=True)
    icon.convert("RGB").save(ASSETS / "icon-only.png", optimize=True)

    # Adaptive foreground: permissive source, the generator adds a 16.7% inset.
    foreground = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    art = fit_height(character, 990)
    foreground.alpha_composite(art, ((1024 - art.width) // 2, (1024 - art.height) // 2))
    foreground.save(ASSETS / "icon-foreground.png", optimize=True)

    # Adaptive background: full-bleed gradient (post-processed to remove the
    # generator's inset on the background layer).
    adaptive_bg = gradient(1024, (236, 244, 255), (196, 217, 255), (255, 255, 255), 0.8)
    adaptive_bg.save(ASSETS / "icon-background.png", optimize=True)

    for size in (512, 192, 180, 64):
        resized = icon.resize((size, size), Image.LANCZOS)
        resized.convert("RGB").save(GENERATED / f"icon-{size}.png", optimize=True)

    # PWA assets.
    PUBLIC_ICONS.mkdir(parents=True, exist_ok=True)
    for size, name in ((512, "icon-512.png"), (192, "icon-192.png"),
                       (180, "apple-touch-icon.png")):
        icon.resize((size, size), Image.LANCZOS).convert("RGB").save(
            PUBLIC_ICONS / name, optimize=True
        )

    # Maskable icons are cropped to a circle: keep the character well inside
    # the 80% safe zone and let the gradient fill the whole square.
    maskable_bg = gradient(512, (234, 243, 255), (203, 221, 255), (255, 255, 255), 0.75)
    compose_character(maskable_bg, character, 360).convert("RGB").save(
        PUBLIC_ICONS / "icon-maskable-512.png", optimize=True
    )
    icon.resize((64, 64), Image.LANCZOS).convert("RGB").save(
        ROOT / "public" / "favicon.png", optimize=True
    )


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_size: int, max_width: int) -> ImageFont.FreeTypeFont:
    for size in range(max_size, 20, -2):
        font = ImageFont.truetype(str(FONT_BOLD), size)
        box = draw.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= max_width:
            return font
    return ImageFont.truetype(str(FONT_BOLD), 20)


def make_splash(character: Image.Image, dark: bool) -> None:
    size = 2732
    if dark:
        bg = gradient(size, (9, 14, 28), (21, 34, 62), (38, 67, 128), 0.55)
        title_color = (244, 248, 255)
        sub_color = (154, 178, 220)
    else:
        bg = gradient(size, (247, 250, 255), (222, 235, 255), (255, 255, 255), 0.7)
        title_color = (23, 39, 74)
        sub_color = (105, 126, 164)

    # Keep content inside the central 1229 px that CENTER_CROP shows on a
    # 1080x2400 phone.
    art = fit_height(character, 880)
    splash = bg.convert("RGBA")
    splash.alpha_composite(art, ((size - art.width) // 2, 1020))

    draw = ImageDraw.Draw(splash)
    title = "deepseek手机api版"
    font = fit_font(draw, title, 116, 1080)
    box = draw.textbbox((0, 0), title, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    draw.text(((size - tw) / 2 - box[0], 2020), title, font=font, fill=title_color)

    sub = "DEEPSEEK MOBILE API"
    sub_font = ImageFont.truetype(str(FONT_BOLD), 34)
    sbox = draw.textbbox((0, 0), sub, font=sub_font)
    sw = sbox[2] - sbox[0]
    draw.text(((size - sw) / 2 - sbox[0], 2180), sub, font=sub_font, fill=sub_color)

    splash.convert("RGB").save(ASSETS / ("splash-dark.png" if dark else "splash.png"), optimize=True)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB").crop(CROP)
    character = remove_white_background(source)
    bbox = character.getbbox()
    if bbox is None:
        raise SystemExit("no character pixels found")
    character = character.crop(bbox)
    character.save(ASSETS / "character-cutout.png", optimize=True)

    write_icon_set(character)
    make_splash(character, dark=False)
    make_splash(character, dark=True)
    print("generated icon and splash assets", character.size)


if __name__ == "__main__":
    main()
