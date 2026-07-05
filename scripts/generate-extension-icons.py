from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "public" / "icon"
PROMO_DIR = ROOT / "docs" / "store" / "promotional"
SIZES = (16, 32, 48, 128)
BASE_SIZE = 1024


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def draw_symbol(
    canvas: Image.Image,
    *,
    outline: list[tuple[int, int]],
    left_edge: list[tuple[int, int]],
    tail: list[tuple[int, int]],
    fold: list[tuple[int, int]],
    fold_fill: list[tuple[int, int]],
    marks: tuple[tuple[int, int, int, int], tuple[int, int, int, int], tuple[int, int, int, int]],
    pdf_box: tuple[int, int, int, int],
    doc_box: tuple[int, int, int, int],
    stroke: int,
    include_label_text: bool,
    use_contrast_understroke: bool,
) -> None:
    draw = ImageDraw.Draw(canvas)
    teal = "#0B7E72"
    teal_dark = "#08695F"

    paths = (outline, left_edge, tail, fold)
    if use_contrast_understroke:
        for path in paths:
            draw.line(path, fill=(255, 255, 255, 220), width=stroke + 34, joint="curve")
    for path in paths:
        draw.line(path, fill=teal, width=stroke, joint="curve")

    draw.polygon(fold_fill, fill="#E8F7F5")
    draw.line(marks[0], fill=teal_dark, width=max(28, stroke - 16))
    draw.line(marks[1], fill=teal_dark, width=max(28, stroke - 16))
    draw.ellipse(marks[2], fill=teal_dark)

    draw.rounded_rectangle(pdf_box, radius=24, fill="#F05A4A")
    draw.rounded_rectangle(doc_box, radius=24, fill="#3B7BE3")
    draw.rounded_rectangle(pdf_box, radius=24, outline="#FFFFFF", width=7)
    draw.rounded_rectangle(doc_box, radius=24, outline="#FFFFFF", width=7)

    if include_label_text:
        label_font = font(52)
        pdf_center = ((pdf_box[0] + pdf_box[2]) // 2, (pdf_box[1] + pdf_box[3]) // 2)
        doc_center = ((doc_box[0] + doc_box[2]) // 2, (doc_box[1] + doc_box[3]) // 2)
        draw.text(pdf_center, "PDF", fill="#FFFFFF", font=label_font, anchor="mm")
        draw.text(doc_center, "DOC", fill="#FFFFFF", font=label_font, anchor="mm")


def draw_design_icon(size: int) -> Image.Image:
    canvas = Image.new("RGBA", (BASE_SIZE, BASE_SIZE), (0, 0, 0, 0))

    if size <= 32:
        draw_symbol(
            canvas,
            outline=[(250, 90), (640, 90), (815, 265), (815, 520)],
            left_edge=[(250, 90), (180, 90), (105, 165), (105, 620)],
            tail=[(105, 620), (130, 710), (240, 760), (190, 930), (390, 760), (620, 760)],
            fold=[(640, 90), (640, 215), (690, 265), (815, 265)],
            fold_fill=[(682, 145), (760, 223), (682, 223)],
            marks=((260, 390, 535, 390), (260, 520, 470, 520), (525, 490, 585, 550)),
            pdf_box=(650, 570, 965, 710),
            doc_box=(650, 745, 965, 885),
            stroke=84,
            include_label_text=False,
            use_contrast_understroke=True,
        )
        return canvas

    shadow = Image.new("RGBA", (BASE_SIZE, BASE_SIZE), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    card_box = (42, 42, 982, 982)
    shadow_draw.rounded_rectangle(card_box, radius=190, fill=(17, 24, 39, 30))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    canvas.alpha_composite(shadow)

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(card_box, radius=190, fill="#FFFFFF")
    draw.rounded_rectangle(card_box, radius=190, outline="#EEF1F5", width=4)

    draw_symbol(
        canvas,
        outline=[(300, 155), (655, 155), (830, 330), (830, 535)],
        left_edge=[(300, 155), (250, 155), (205, 205), (205, 610)],
        tail=[(205, 610), (230, 690), (320, 760), (275, 890), (445, 760), (635, 760)],
        fold=[(655, 155), (655, 275), (710, 330), (830, 330)],
        fold_fill=[(700, 210), (775, 285), (700, 285)],
        marks=((330, 430, 570, 430), (330, 535, 510, 535), (555, 505, 605, 555)),
        pdf_box=(650, 585, 930, 695),
        doc_box=(650, 715, 930, 825),
        stroke=52,
        include_label_text=True,
        use_contrast_understroke=False,
    )

    return canvas


def generate_icon(size: int) -> Image.Image:
    base = draw_design_icon(size)
    resampling = Image.Resampling.LANCZOS
    return base.resize((size, size), resampling)


def generate_small_promo() -> Image.Image:
    promo = Image.new("RGBA", (440, 280), "#F7FAFC")
    draw = ImageDraw.Draw(promo)
    draw.rounded_rectangle((16, 16, 424, 264), radius=28, fill="#FFFFFF", outline="#E6EAF0", width=2)

    icon = draw_design_icon(128).resize((132, 132), Image.Resampling.LANCZOS)
    promo.alpha_composite(icon, (44, 74))

    title_font = font(24)
    body_font = font(15, bold=False)
    small_font = font(13, bold=False)
    draw.text((202, 74), "ChatGPT2Doc", fill="#111827", font=title_font)
    draw.text((202, 112), "DOCX / PDF exports for ChatGPT", fill="#374151", font=body_font)
    draw.text((202, 138), "Local processing. Editable formulas.", fill="#4B5563", font=body_font)

    draw.rounded_rectangle((202, 180, 276, 214), radius=12, fill="#F05A4A")
    draw.rounded_rectangle((288, 180, 362, 214), radius=12, fill="#3B7BE3")
    draw.text((239, 197), "PDF", fill="#FFFFFF", font=small_font, anchor="mm")
    draw.text((325, 197), "DOC", fill="#FFFFFF", font=small_font, anchor="mm")
    draw.text((202, 230), "No cloud conversion or telemetry", fill="#6B7280", font=small_font)
    return promo.convert("RGB")


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        generate_icon(size).save(ICON_DIR / f"{size}.png")
    PROMO_DIR.mkdir(parents=True, exist_ok=True)
    generate_small_promo().save(PROMO_DIR / "small-promo.png")


if __name__ == "__main__":
    main()
