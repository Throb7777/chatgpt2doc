import notoSansUnicodeRanges from '@fontsource/noto-sans-sc/unicode.json';
import notoSansSymbolsUnicodeRanges from '@fontsource/noto-sans-symbols-2/unicode.json';
import type { PDFDocument, PDFFont } from 'pdf-lib';

const FONT_ASSET_PATHS: Readonly<Record<string, string>> = {
  'cjk-bold': 'fonts/noto-sans-sc-bold.ttf',
  'cjk-regular': 'fonts/noto-sans-sc-regular.ttf',
  math: 'fonts/noto-sans-math-400-normal.ttf',
  'math-greek': 'fonts/noto-sans-greek-400-normal.ttf',
  mono: 'fonts/cascadia-mono-latin-400-normal.ttf',
  'mono-symbol': 'fonts/cascadia-mono-symbols2-400-normal.ttf',
  'serif-bold': 'fonts/noto-serif-latin-700-normal.ttf',
  'serif-bold-italic': 'fonts/noto-serif-latin-700-italic.ttf',
  'serif-italic': 'fonts/noto-serif-latin-400-italic.ttf',
  'serif-regular': 'fonts/noto-serif-latin-400-normal.ttf',
  symbol: 'fonts/noto-sans-symbols-2-400-normal.ttf',
};

interface UnicodeRange {
  end: number;
  start: number;
}

interface FontFragment {
  id: string;
  ranges: UnicodeRange[];
}

export interface PdfFontEnvironment {
  loadFragment(id: string): Promise<Uint8Array>;
}

export interface PdfFontRun {
  font: PDFFont;
  text: string;
}

function parseUnicodeRanges(value: string): UnicodeRange[] {
  return value.split(',').map((part) => {
    const [start, end = start] = part.trim().replace(/^U\+/i, '').split('-');
    return {
      end: Number.parseInt(end, 16),
      start: Number.parseInt(start, 16),
    };
  });
}

const notoSansScRanges: UnicodeRange[] = Object.entries(notoSansUnicodeRanges)
  .map(([, value]) => parseUnicodeRanges(value))
  .flat();

const fontFragments: FontFragment[] = [{
  id: 'cjk-regular',
  ranges: notoSansScRanges,
}];
fontFragments.unshift({
  id: 'math-greek',
  ranges: [
    { end: 0x0377, start: 0x0370 },
    { end: 0x037f, start: 0x037a },
    { end: 0x038a, start: 0x0384 },
    { end: 0x038c, start: 0x038c },
    { end: 0x03a1, start: 0x038e },
    { end: 0x03ff, start: 0x03a3 },
  ],
});
fontFragments.unshift({
  id: 'symbol',
  ranges: parseUnicodeRanges(notoSansSymbolsUnicodeRanges.symbols),
});
fontFragments.unshift({
  id: 'math',
  ranges: [
    { end: 0x03ff, start: 0x0370 },
    { end: 0x214f, start: 0x2100 },
    { end: 0x22ff, start: 0x2190 },
    { end: 0x27ff, start: 0x27f0 },
    { end: 0x2aff, start: 0x2a00 },
    { end: 0x1d7ff, start: 0x1d400 },
  ],
});
fontFragments.unshift({
  id: 'mono-symbol',
  ranges: [{ end: 0x259f, start: 0x2500 }],
});

function assetUrlForFragment(id: string): string {
  const path = FONT_ASSET_PATHS[id];
  if (!path) throw new Error(`Missing bundled PDF font fragment: ${id}`);
  return typeof browser === 'undefined'
    ? path
    : browser.runtime.getURL(`/${path}` as Parameters<typeof browser.runtime.getURL>[0]);
}

export function createBrowserPdfFontEnvironment(): PdfFontEnvironment {
  return {
    async loadFragment(id) {
      const response = await fetch(assetUrlForFragment(id));
      if (!response.ok) {
        throw new Error(`Failed to load bundled Noto Sans SC fragment ${id}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

export function fontFragmentForCodePoint(codePoint: number): string {
  if (codePoint === 0x2016) return 'math';
  const fragment = fontFragments.find(({ ranges }) =>
    ranges.some(({ end, start }) => codePoint >= start && codePoint <= end));
  if (!fragment) {
    throw new Error(`No bundled PDF font covers Unicode code point U+${
      codePoint.toString(16).toUpperCase()
    }`);
  }
  return fragment.id;
}

export function fontFragmentsForText(text: string): string[] {
  return [...new Set(
    Array.from(text, (character) =>
      fontFragmentForCodePoint(character.codePointAt(0) as number)),
  )];
}

export async function embedPdfFonts(
  document: PDFDocument,
  text: string,
  environment: PdfFontEnvironment = createBrowserPdfFontEnvironment(),
): Promise<Map<string, PDFFont>> {
  const ids = new Set(fontFragmentsForText(text));
  if (ids.has('cjk-regular')) ids.add('cjk-bold');
  const entries = await Promise.all([...ids].map(async (id) => {
    const bytes = await environment.loadFragment(id);
    // fontkit can omit high glyph IDs from these symbol-heavy fonts when
    // subsetting, leaving valid text mappings but blank rendered glyphs.
    const font = await document.embedFont(bytes, {
      subset: id !== 'math' && id !== 'symbol' && id !== 'cjk-bold',
    });
    return [id, font] as const;
  }));
  return new Map(entries);
}

export function createPdfFontRuns(
  text: string,
  fonts: ReadonlyMap<string, PDFFont>,
): PdfFontRun[] {
  const runs: Array<PdfFontRun & { fragmentId: string }> = [];
  for (const character of text) {
    const id = fontFragmentForCodePoint(character.codePointAt(0) as number);
    const font = fonts.get(id);
    if (!font) throw new Error(`PDF font fragment ${id} was not embedded`);
    const previous = runs.at(-1);
    if (previous?.fragmentId === id) {
      previous.text += character;
    } else {
      runs.push({ font, fragmentId: id, text: character });
    }
  }
  return runs.map(({ font, text }) => ({ font, text }));
}
