import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { PdfFontEnvironment } from '../../src/renderers/pdf/pdf-fonts';

function fontAsset(id: string): string {
  switch (id) {
    case 'mono':
      return 'cascadia-mono-latin-400-normal.ttf';
    case 'mono-symbol':
      return 'cascadia-mono-symbols2-400-normal.ttf';
    case 'math':
      return 'noto-sans-math-400-normal.ttf';
    case 'math-greek':
      return 'noto-sans-greek-400-normal.ttf';
    case 'symbol':
      return 'noto-sans-symbols-2-400-normal.ttf';
    case 'cjk-bold':
      return 'noto-sans-sc-bold.ttf';
    case 'cjk-regular':
      return 'noto-sans-sc-regular.ttf';
    case 'serif-bold':
      return 'noto-serif-latin-700-normal.ttf';
    case 'serif-bold-italic':
      return 'noto-serif-latin-700-italic.ttf';
    case 'serif-italic':
      return 'noto-serif-latin-400-italic.ttf';
    case 'serif-regular':
      return 'noto-serif-latin-400-normal.ttf';
    default:
      return `noto-sans-sc-${id}-400-normal.ttf`;
  }
}

export const nodePdfFontEnvironment: PdfFontEnvironment = {
  loadFragment(id) {
    const file = fontAsset(id);
    return readFile(path.join(
      process.cwd(),
      'public',
      'fonts',
      file,
    ));
  },
};
