import baseFontkit, {
  type Font,
  type GlyphRun,
  type TypeFeatures,
} from '@pdf-lib/fontkit';

function directGlyphLayout(font: Font, text: string): GlyphRun {
  const glyphs = Array.from(text, (character) =>
    font.glyphForCodePoint(character.codePointAt(0) as number));
  return {
    advanceHeight: 0,
    advanceWidth: glyphs.reduce((total, glyph) => total + glyph.advanceWidth, 0),
    bbox: font.bbox,
    direction: 'ltr',
    features: {},
    glyphs,
    language: null,
    positions: glyphs.map((glyph) => ({
      xAdvance: glyph.advanceWidth,
      xOffset: 0,
      yAdvance: 0,
      yOffset: 0,
    })),
    script: 'DFLT',
  };
}

function patchFragmentLayout(font: Font): Font {
  const originalLayout = font.layout.bind(font);
  const layout = (
    text: string,
    features?: TypeFeatures | (keyof TypeFeatures)[],
  ): GlyphRun => {
    const shaped = originalLayout(text, features);
    const direct = directGlyphLayout(font, text);
    const isCorrect = shaped.glyphs.length === direct.glyphs.length
      && shaped.glyphs.every((glyph, index) => glyph.id === direct.glyphs[index]?.id);
    return isCorrect ? shaped : direct;
  };
  Object.defineProperty(font, 'layout', { value: layout });
  return font;
}

export const pdfFontkit = {
  ...baseFontkit,
  create(buffer: Uint8Array, postscriptName?: string) {
    return patchFragmentLayout(baseFontkit.create(buffer, postscriptName));
  },
};
