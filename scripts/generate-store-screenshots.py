from __future__ import annotations

from io import BytesIO
from pathlib import Path
import textwrap

import matplotlib.pyplot as plt
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "store" / "screenshots"
W, H = 1280, 800


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


F = {
    "hero": font(46, True),
    "title": font(32, True),
    "h2": font(25, True),
    "body": font(22),
    "small": font(17),
    "tiny": font(14),
    "badge": font(18, True),
    "mono": ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 18)
    if Path("C:/Windows/Fonts/consola.ttf").exists()
    else font(18),
}


def canvas() -> Image.Image:
    img = Image.new("RGB", (W, H), "#f7f8fb")
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        r = int(247 + 5 * t)
        g = int(248 + 3 * t)
        b = int(251 - 2 * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))
    return img


def round_rect(draw: ImageDraw.ImageDraw, box, radius=26, fill="#ffffff", outline="#e5e7eb", width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def shadow_card(img: Image.Image, box, radius=28, fill="#ffffff"):
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    x1, y1, x2, y2 = box
    sd.rounded_rectangle((x1 + 4, y1 + 8, x2 + 4, y2 + 8), radius=radius, fill=(22, 30, 44, 28))
    shadow = shadow.filter(Image.Filter.GaussianBlur(14)) if hasattr(Image, "Filter") else shadow
    img.paste(Image.alpha_composite(img.convert("RGBA"), shadow).convert("RGB"))
    round_rect(ImageDraw.Draw(img), box, radius=radius, fill=fill, outline="#e7e9ee")


def text(draw: ImageDraw.ImageDraw, xy, value, fill="#111827", f=None):
    draw.text(xy, value, fill=fill, font=f or F["body"])


def wrapped(draw: ImageDraw.ImageDraw, xy, value, width_chars=42, fill="#4b5563", f=None, line_gap=8):
    x, y = xy
    f = f or F["body"]
    for line in textwrap.wrap(value, width=width_chars):
        draw.text((x, y), line, fill=fill, font=f)
        y += f.size + line_gap
    return y


def formula_image(expr: str, size=30) -> Image.Image:
    fig = plt.figure(figsize=(1, 1), dpi=220)
    fig.patch.set_alpha(0)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.axis("off")
    ax.text(0.02, 0.5, expr, fontsize=size, va="center", ha="left", color="#111827")
    buf = BytesIO()
    fig.savefig(buf, format="png", transparent=True, bbox_inches="tight", pad_inches=0.04)
    plt.close(fig)
    buf.seek(0)
    return Image.open(buf).convert("RGBA")


def paste_formula(img: Image.Image, expr: str, xy, size=30, max_size=(420, 96)):
    rendered = formula_image(expr, size=size)
    rendered.thumbnail(max_size, Image.Resampling.LANCZOS)
    img.paste(rendered.convert("RGB"), xy, rendered)


def icon_button(draw, x, y, label):
    round_rect(draw, (x, y, x + 54, y + 42), radius=14, fill="#ffffff", outline="#d8dde6")
    draw.text((x + 14, y + 10), label, fill="#4b5563", font=F["badge"])


def screenshot_1():
    img = canvas()
    draw = ImageDraw.Draw(img)
    text(draw, (72, 70), "Export right inside ChatGPT", f=F["hero"])
    wrapped(draw, (75, 132), "Small DOCX and PDF controls appear beside assistant replies and in a compact floating panel.", 54)

    shadow_card(img, (70, 210, 790, 690), 30)
    text(draw, (112, 250), "Assistant response", f=F["h2"])
    wrapped(draw, (112, 294), "A clean export keeps headings, lists, links, code, images, and equations readable.", 52)
    paste_formula(img, r"$E=\frac{x^2+1}{\sqrt{y}}\quad \Upsilon_2$", (255, 360), 30, (360, 86))
    draw.rounded_rectangle((112, 492, 694, 606), radius=18, fill="#f3f4f6")
    text(draw, (138, 520), "for item in results:", f=F["mono"], fill="#374151")
    text(draw, (168, 552), "export(item, format='docx')", f=F["mono"], fill="#374151")
    icon_button(draw, 680, 246, "W")
    icon_button(draw, 742, 246, "PDF")

    shadow_card(img, (850, 250, 1172, 468), 34)
    text(draw, (890, 290), "Floating panel", f=F["h2"])
    icon_button(draw, 905, 350, "W")
    icon_button(draw, 973, 350, "PDF")
    round_rect(draw, (1042, 350, 1094, 392), radius=14, fill="#ffffff", outline="#d8dde6")
    draw.ellipse((1060, 362, 1076, 378), fill="#6b7280")
    wrapped(draw, (890, 420), "Drag it once. Chrome remembers the position.", 28, f=F["small"])
    return img


def screenshot_2():
    img = canvas()
    draw = ImageDraw.Draw(img)
    text(draw, (72, 68), "Choose exactly what to export", f=F["hero"])
    wrapped(draw, (75, 132), "Export one reply, the whole conversation, assistant-only content, or selected messages.", 62)

    labels = [
        ("Single reply", "Hover and export one assistant answer."),
        ("Full conversation", "Keep the visible page order."),
        ("Assistant only", "Filter out user prompts automatically."),
        ("Selected messages", "Tick only the messages you need."),
    ]
    for i, (title, body) in enumerate(labels):
        x = 80 + (i % 2) * 560
        y = 230 + (i // 2) * 210
        shadow_card(img, (x, y, x + 480, y + 150), 26)
        draw.ellipse((x + 34, y + 46, x + 74, y + 86), fill="#0f766e")
        draw.text((x + 47, y + 51), str(i + 1), fill="white", font=F["small"])
        text(draw, (x + 96, y + 34), title, f=F["h2"])
        wrapped(draw, (x + 96, y + 76), body, 34, f=F["small"])

    shadow_card(img, (365, 645, 915, 724), 24)
    text(draw, (405, 668), "Progress: collecting → generating → downloading", f=F["small"], fill="#374151")
    return img


def screenshot_3():
    img = canvas()
    draw = ImageDraw.Draw(img)
    text(draw, (72, 68), "Technical content stays useful", f=F["hero"])
    wrapped(draw, (75, 132), "Supported formulas become editable Word equations. PDFs keep searchable text and embedded fonts.", 66)

    shadow_card(img, (78, 220, 610, 688), 30)
    text(draw, (118, 260), "Word document", f=F["h2"])
    paste_formula(img, r"$H(p)=-\sum_i p_i\log p_i$", (128, 330), 28, (390, 76))
    paste_formula(img, r"$\max_\theta \sum_t \log p_\theta(x_t\mid x_{<t})$", (120, 432), 24, (420, 80))
    wrapped(draw, (118, 558), "Native equation structures remain editable when Word supports the formula.", 42, f=F["small"])

    shadow_card(img, (670, 220, 1202, 688), 30)
    text(draw, (710, 260), "Searchable PDF", f=F["h2"])
    paste_formula(img, r"$\int_0^1 x^2\,dx\quad\prod_{k=1}^{m}q_k$", (730, 336), 28, (390, 86))
    draw.rounded_rectangle((720, 470, 1138, 550), radius=18, fill="#f3f4f6")
    text(draw, (746, 494), "Find: \"Shannon\"  1 result", f=F["mono"], fill="#374151")
    wrapped(draw, (710, 582), "If a structure is unsupported, it is shown explicitly instead of being deleted.", 42, f=F["small"])
    return img


def screenshot_4():
    img = canvas()
    draw = ImageDraw.Draw(img)
    text(draw, (72, 68), "Local by default", f=F["hero"])
    wrapped(draw, (75, 132), "No account, subscription, analytics, telemetry, or external conversion server.", 62)

    shadow_card(img, (90, 230, 560, 650), 32)
    text(draw, (130, 274), "Extension-only", f=F["h2"])
    for i, line in enumerate(["DOCX export", "PDF export", "Copy to Microsoft Word"]):
        y = 340 + i * 74
        draw.ellipse((136, y + 4, 166, y + 34), fill="#0f766e")
        draw.line((144, y + 20, 151, y + 28, 160, y + 12), fill="white", width=3)
        text(draw, (186, y), line, f=F["body"])

    shadow_card(img, (650, 230, 1180, 650), 32)
    text(draw, (690, 274), "Optional WPS helper", f=F["h2"])
    wrapped(draw, (690, 334), "For editable WPS equations, install the local helper package from Releases. It opens no network port and is not needed for normal export.", 44)
    draw.rounded_rectangle((690, 514, 1040, 574), radius=18, fill="#ecfeff", outline="#a5f3fc")
    text(draw, (718, 532), "Native Messaging: optional", f=F["small"], fill="#155e75")
    return img


def save_rgb(name: str, img: Image.Image):
    OUT.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(OUT / name, "PNG")


def main():
    images = [
        ("chatgpt2doc-01-export-controls.png", screenshot_1()),
        ("chatgpt2doc-02-export-scopes.png", screenshot_2()),
        ("chatgpt2doc-03-technical-content.png", screenshot_3()),
        ("chatgpt2doc-04-local-privacy.png", screenshot_4()),
    ]
    for name, img in images:
        save_rgb(name, img)
    save_rgb("export-actions.png", images[0][1])
    save_rgb("export-settings.png", images[1][1])


if __name__ == "__main__":
    main()
