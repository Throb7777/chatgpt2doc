from pathlib import Path
from shutil import copyfile

from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
EXPO_SOURCE = ROOT / "node_modules" / "@expo-google-fonts" / "noto-sans-sc"
OUTPUT = ROOT / "src" / "assets" / "fonts" / "noto-sans-sc"
GREEK_SOURCE = (
    ROOT
    / "node_modules"
    / "@fontsource"
    / "noto-sans"
    / "files"
    / "noto-sans-greek-400-normal.woff2"
)
GREEK_OUTPUT = ROOT / "src" / "assets" / "fonts" / "noto-sans"
SYMBOL_SOURCE = (
    ROOT
    / "node_modules"
    / "@fontsource"
    / "noto-sans-symbols-2"
    / "files"
    / "noto-sans-symbols-2-symbols-400-normal.woff2"
)
SYMBOL_OUTPUT = ROOT / "src" / "assets" / "fonts" / "noto-sans-symbols-2"
MATH_SOURCE = (
    ROOT
    / "node_modules"
    / "@fontsource"
    / "noto-sans-math"
    / "files"
    / "noto-sans-math-latin-400-normal.woff2"
)
MATH_OUTPUT = ROOT / "src" / "assets" / "fonts" / "noto-sans-math"
SERIF_SOURCE = ROOT / "node_modules" / "@fontsource" / "noto-serif"
SERIF_OUTPUT = ROOT / "src" / "assets" / "fonts" / "noto-serif"
SERIF_FILES = (
    "noto-serif-latin-400-normal.woff2",
    "noto-serif-latin-400-italic.woff2",
    "noto-serif-latin-700-normal.woff2",
    "noto-serif-latin-700-italic.woff2",
)
MONO_SOURCE = ROOT / "node_modules" / "@fontsource" / "noto-sans-mono"
MONO_OUTPUT = ROOT / "src" / "assets" / "fonts" / "noto-sans-mono"
MONO_FILE = "noto-sans-mono-latin-400-normal.woff2"
CASCADIA_SOURCE = ROOT / "node_modules" / "@fontsource" / "cascadia-mono"
CASCADIA_OUTPUT = ROOT / "src" / "assets" / "fonts" / "cascadia-mono"
CASCADIA_FILES = (
    "cascadia-mono-latin-400-normal.woff2",
    "cascadia-mono-symbols2-400-normal.woff2",
)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    cjk_sources = {
        "noto-sans-sc-bold.ttf": EXPO_SOURCE / "700Bold" / "NotoSansSC_700Bold.ttf",
        "noto-sans-sc-regular.ttf": EXPO_SOURCE / "400Regular" / "NotoSansSC_400Regular.ttf",
    }
    for source in cjk_sources.values():
        if not source.exists():
            raise RuntimeError(f"Licensed Noto Sans SC TTF is missing: {source}")
    for stale in OUTPUT.glob("noto-sans-sc-*.ttf"):
        stale.unlink()
    for target_name, source in cjk_sources.items():
        target = OUTPUT / target_name
        font = TTFont(source, recalcTimestamp=False)
        font.recalcTimestamp = False
        font.flavor = None
        font.save(target)

    cjk_license = OUTPUT / "OFL-1.1.txt"
    copyfile(EXPO_SOURCE / "LICENSE_FONT", cjk_license)
    normalized_license = "\n".join(
        line.rstrip() for line in cjk_license.read_text(encoding="utf-8").splitlines()
    )
    cjk_license.write_text(f"{normalized_license}\n", encoding="utf-8")
    GREEK_OUTPUT.mkdir(parents=True, exist_ok=True)
    greek_font = TTFont(GREEK_SOURCE, recalcTimestamp=False)
    greek_font.recalcTimestamp = False
    greek_font.flavor = None
    greek_font.save(GREEK_OUTPUT / "noto-sans-greek-400-normal.ttf")
    copyfile(GREEK_SOURCE.parents[1] / "LICENSE", GREEK_OUTPUT / "OFL-1.1.txt")
    SYMBOL_OUTPUT.mkdir(parents=True, exist_ok=True)
    symbol_font = TTFont(SYMBOL_SOURCE, recalcTimestamp=False)
    symbol_font.recalcTimestamp = False
    symbol_font.flavor = None
    symbol_font.save(SYMBOL_OUTPUT / "noto-sans-symbols-2-400-normal.ttf")
    copyfile(SYMBOL_SOURCE.parents[1] / "LICENSE", SYMBOL_OUTPUT / "OFL-1.1.txt")
    MATH_OUTPUT.mkdir(parents=True, exist_ok=True)
    math_font = TTFont(MATH_SOURCE, recalcTimestamp=False)
    math_font.recalcTimestamp = False
    math_font.flavor = None
    math_font.save(MATH_OUTPUT / "noto-sans-math-400-normal.ttf")
    copyfile(MATH_SOURCE.parents[1] / "LICENSE", MATH_OUTPUT / "OFL-1.1.txt")
    SERIF_OUTPUT.mkdir(parents=True, exist_ok=True)
    for name in SERIF_FILES:
        serif_font = TTFont(SERIF_SOURCE / "files" / name, recalcTimestamp=False)
        serif_font.recalcTimestamp = False
        serif_font.flavor = None
        serif_font.save(SERIF_OUTPUT / Path(name).with_suffix(".ttf"))
    copyfile(SERIF_SOURCE / "LICENSE", SERIF_OUTPUT / "OFL-1.1.txt")
    MONO_OUTPUT.mkdir(parents=True, exist_ok=True)
    mono_font = TTFont(MONO_SOURCE / "files" / MONO_FILE, recalcTimestamp=False)
    mono_font.recalcTimestamp = False
    mono_font.flavor = None
    mono_font.save(MONO_OUTPUT / Path(MONO_FILE).with_suffix(".ttf"))
    copyfile(MONO_SOURCE / "LICENSE", MONO_OUTPUT / "OFL-1.1.txt")
    CASCADIA_OUTPUT.mkdir(parents=True, exist_ok=True)
    for name in CASCADIA_FILES:
        cascadia_font = TTFont(CASCADIA_SOURCE / "files" / name, recalcTimestamp=False)
        cascadia_font.recalcTimestamp = False
        cascadia_font.flavor = None
        cascadia_font.save(CASCADIA_OUTPUT / Path(name).with_suffix(".ttf"))
    copyfile(CASCADIA_SOURCE / "LICENSE", CASCADIA_OUTPUT / "OFL-1.1.txt")
    print(
        "Generated regular/bold CJK fonts, one Greek fragment, "
        "one symbol font, one math font, four serif styles, and mono font subsets"
    )


if __name__ == "__main__":
    main()
