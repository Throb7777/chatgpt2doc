import { type PDFFont, type PDFPage, rgb } from 'pdf-lib';

import type { MathBlockNode, MathInlineNode } from '../../document/ast';
import {
  type MathExpression,
  type MathParseEnvironment,
  normalizeUnicodeDigitScripts,
  parseMathExpression,
  parseMathNodeExpression,
} from '../math/math-expression';
import { drawPdfTextRun } from './pdf-foundation';
import { fontFragmentForCodePoint } from './pdf-fonts';

type PdfFonts = ReadonlyMap<string, PDFFont>;

export interface PdfMathBox {
  atom?: MathAtom;
  ascent: number;
  descent: number;
  draw(page: PDFPage, x: number, baseline: number): void;
  width: number;
}

type MathAtom = 'binary' | 'close' | 'inner' | 'open' | 'ordinary' | 'punctuation' | 'relation';

export interface PdfMathStyleFonts {
  italic: PDFFont;
  regular: PDFFont;
}

export type PdfMathEnvironment = MathParseEnvironment;

export interface PdfMathLayout {
  box: PdfMathBox;
  fallback: boolean;
}

export interface PdfHatAccentSegment {
  end: { x: number; y: number };
  start: { x: number; y: number };
}

export const PDF_MATH_GLYPH_COVERAGE = '∑∏∫√αβγδεηθλμξπρσφψΣℓ∞∂±×⊤∧→←↔↛⇒⇏⇔⇓⟶⟹≤≥≠≈∈∉⊂⊆⊃⊇∪∩∥∣∗𝒯()[]{}%';

const ORNAMENTAL_IDENTIFIERS = new Set([
  ...'𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵',
  ...'𝒶𝒷𝒸𝒹ℯ𝒻ℊ𝒽𝒾𝒿𝓀𝓁𝓂𝓃ℴ𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏',
]);

function ordinaryPdfIdentifiers(value: string): string {
  return [...value].map((character) => (
    ORNAMENTAL_IDENTIFIERS.has(character) ? character.normalize('NFKC') : character
  )).join('');
}

export function pdfHatAccentSegments(
  x: number,
  y: number,
  width: number,
  size: number,
): [PdfHatAccentSegment, PdfHatAccentSegment] {
  const center = x + width * 0.5;
  const accentWidth = Math.max(size * 0.34, Math.min(width * 0.74, size * 0.58));
  const leftX = center - accentWidth / 2;
  const rightX = center + accentWidth / 2;
  const apexY = y + size * 0.16;
  return [
    { end: { x: center, y: apexY }, start: { x: leftX, y } },
    { end: { x: rightX, y }, start: { x: center, y: apexY } },
  ];
}

function fontFor(
  fonts: PdfFonts,
  character: string,
  styleFonts?: PdfMathStyleFonts,
): PDFFont {
  if (/^[A-Za-z]$/u.test(character) && styleFonts) return styleFonts.italic;
  if (/^[\u0020-\u007E]$/u.test(character) && styleFonts) return styleFonts.regular;
  const fragment = fontFragmentForCodePoint(character.codePointAt(0) as number);
  const font = fonts.get(fragment);
  if (!font) throw new Error(`PDF math font fragment ${fragment} was not embedded`);
  return font;
}

function atomForText(value: string): MathAtom {
  if (/^[=<>∈∉≤≥≠≈≡⊂⊆⊃⊇→←↔↑↓]$/u.test(value)) return 'relation';
  if (/^[+\-−±×÷∧]$/u.test(value)) return 'binary';
  if (/^[([{]$/u.test(value)) return 'open';
  if (/^[)\]}]$/u.test(value)) return 'close';
  if (/^[,;:]$/u.test(value)) return 'punctuation';
  return 'ordinary';
}

function textBox(
  value: string,
  fonts: PdfFonts,
  size: number,
  styleFonts?: PdfMathStyleFonts,
): PdfMathBox {
  value = ordinaryPdfIdentifiers(value);
  const glyphs = Array.from(value, (character) => {
    const font = fontFor(fonts, character, styleFonts);
    const skew = /^[α-ω]$/u.test(character) ? 0.18 : 0;
    return { character, font, skew, width: font.widthOfTextAtSize(character, size) };
  });
  const runs: Array<{ font: PDFFont; skew: number; text: string; width: number }> = [];
  for (const glyph of glyphs) {
    const previous = runs.at(-1);
    if (previous?.font === glyph.font && previous.skew === glyph.skew) {
      previous.text += glyph.character;
      previous.width += glyph.width;
    } else {
      runs.push({
        font: glyph.font,
        skew: glyph.skew,
        text: glyph.character,
        width: glyph.width,
      });
    }
  }
  return {
    atom: atomForText(value),
    ascent: size * 0.82,
    descent: size * 0.24,
    draw(page, x, baseline) {
      let cursor = x;
      for (const run of runs) {
        drawPdfTextRun(page, run.text, {
          color: rgb(0.12, 0.14, 0.17),
          font: run.font,
          size,
          skew: run.skew,
          x: cursor,
          y: baseline,
        });
        cursor += run.width;
      }
    },
    width: glyphs.reduce((total, glyph) => total + glyph.width, 0),
  };
}

function atomGap(left: MathAtom | undefined, right: MathAtom | undefined, size: number): number {
  if (left === 'relation' || right === 'relation') return size * 0.22;
  if (left === 'binary' || right === 'binary') return size * 0.16;
  if (left === 'punctuation') return size * 0.12;
  return 0;
}

function drawRule(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  page.drawRectangle({
    color: rgb(0.12, 0.14, 0.17),
    height,
    width,
    x,
    y,
  });
}

function sequenceBox(children: PdfMathBox[], size: number): PdfMathBox {
  const gaps = children.map((child, index) => (
    index === 0 ? 0 : atomGap(children[index - 1]?.atom, child.atom, size)
  ));
  return {
    atom: children.length === 1 ? children[0]?.atom : 'inner',
    ascent: Math.max(0, ...children.map(({ ascent }) => ascent)),
    descent: Math.max(0, ...children.map(({ descent }) => descent)),
    draw(page, x, baseline) {
      let cursor = x;
      for (const [index, child] of children.entries()) {
        cursor += gaps[index];
        child.draw(page, cursor, baseline);
        cursor += child.width;
      }
    },
    width: children.reduce((total, child, index) => total + gaps[index] + child.width, 0),
  };
}

function delimiterBox(
  expression: Extract<MathExpression, { kind: 'delimiter' }>,
  fonts: PdfFonts,
  size: number,
  styleFonts?: PdfMathStyleFonts,
): PdfMathBox {
  const pair = expression.delimiter === 'round'
    ? ['(', ')']
    : expression.delimiter === 'square'
      ? ['[', ']']
      : expression.delimiter === 'norm'
        ? ['∥', '∥']
        : expression.delimiter === 'absolute'
          ? ['|', '|']
          : ['{', '}'];
  const inner = expressionBox(expression.children, fonts, size, styleFonts);
  if (expression.delimiter === 'square' && inner.ascent + inner.descent > size * 1.4) {
    const bracketWidth = Math.max(7, size * 0.52);
    const padding = 5;
    return {
      atom: 'inner',
      ascent: inner.ascent + 2,
      descent: inner.descent + 2,
      draw(page, x, baseline) {
        const top = baseline + inner.ascent + 2;
        const bottom = baseline - inner.descent - 2;
        const thickness = 1.55;
        const arm = bracketWidth * 0.72;
        const rightX = x + bracketWidth + padding * 2 + inner.width;
        drawRule(page, x, bottom, thickness, top - bottom);
        drawRule(page, x, top - thickness, arm, thickness);
        drawRule(page, x, bottom, arm, thickness);
        drawRule(page, rightX - thickness, bottom, thickness, top - bottom);
        drawRule(page, rightX - arm, top - thickness, arm, thickness);
        drawRule(page, rightX - arm, bottom, arm, thickness);
        inner.draw(page, x + bracketWidth + padding, baseline);
      },
      width: bracketWidth * 2 + padding * 2 + inner.width,
    };
  }
  return sequenceBox([
    textBox(pair[0], fonts, size, styleFonts),
    inner,
    textBox(pair[1], fonts, size, styleFonts),
  ], size);
}

function expressionBox(
  expression: MathExpression,
  fonts: PdfFonts,
  size: number,
  styleFonts?: PdfMathStyleFonts,
): PdfMathBox {
  switch (expression.kind) {
    case 'boxed': {
      const value = expressionBox(expression.children, fonts, size, styleFonts);
      const padding = size * 0.32;
      const width = value.width + padding * 2;
      const ascent = value.ascent + padding;
      const descent = value.descent + padding;
      return {
        atom: 'inner',
        ascent,
        descent,
        draw(page, x, baseline) {
          page.drawRectangle({
            borderColor: rgb(0.12, 0.14, 0.17),
            borderWidth: 0.8,
            height: ascent + descent,
            width,
            x,
            y: baseline - descent,
          });
          value.draw(page, x + padding, baseline);
        },
        width,
      };
    }
    case 'text':
      return textBox(expression.value, fonts, size, styleFonts);
    case 'sequence':
      return sequenceBox(
        expression.children.map((child) => expressionBox(child, fonts, size, styleFonts)),
        size,
      );
    case 'accent': {
      const value = expressionBox(expression.value, fonts, size, styleFonts);
      return {
        atom: 'ordinary',
        ascent: value.ascent + size * 0.26,
        descent: value.descent,
        draw(page, x, baseline) {
          value.draw(page, x, baseline);
          const y = baseline + value.ascent + size * 0.1;
          if (expression.accent === 'tilde') {
            const tilde = textBox('~', fonts, size * 0.78, styleFonts);
            tilde.draw(page, x + (value.width - tilde.width) / 2, y - size * 0.1);
          } else if (expression.accent === 'bar') {
            const width = Math.max(value.width * 0.8, size * 0.36);
            drawRule(page, x + (value.width - width) / 2, y, width, 0.74);
          } else if (expression.accent === 'dot' || expression.accent === 'ddot') {
            const radius = Math.max(0.9, size * 0.055);
            const gap = expression.accent === 'ddot' ? Math.max(radius * 3, size * 0.18) : 0;
            const center = x + value.width / 2;
            for (const dotX of expression.accent === 'ddot'
              ? [center - gap / 2, center + gap / 2]
              : [center]) {
              page.drawEllipse({
                color: rgb(0.12, 0.14, 0.17),
                x: dotX,
                xScale: radius,
                y,
                yScale: radius,
              });
            }
          } else {
            const [left, right] = pdfHatAccentSegments(x, y, value.width, size);
            page.drawLine({ ...left, color: rgb(0.12, 0.14, 0.17), thickness: 0.72 });
            page.drawLine({ ...right, color: rgb(0.12, 0.14, 0.17), thickness: 0.72 });
          }
        },
        width: value.width,
      };
    }
    case 'delimiter':
      return delimiterBox(expression, fonts, size, styleFonts);
    case 'fraction': {
      const numerator = expressionBox(expression.numerator, fonts, size * 0.8, styleFonts);
      const denominator = expressionBox(expression.denominator, fonts, size * 0.8, styleFonts);
      const width = Math.max(numerator.width, denominator.width) + 8;
      return {
        atom: 'inner',
        ascent: numerator.ascent + numerator.descent + 5,
        descent: denominator.ascent + denominator.descent + 5,
        draw(page, x, baseline) {
          numerator.draw(page, x + (width - numerator.width) / 2, baseline + 6);
          denominator.draw(page, x + (width - denominator.width) / 2, baseline - denominator.ascent - 6);
          page.drawLine({
            color: rgb(0.12, 0.14, 0.17),
            end: { x: x + width - 1, y: baseline + 2 },
            start: { x: x + 1, y: baseline + 2 },
            thickness: 0.8,
          });
        },
        width,
      };
    }
    case 'script': {
      const base = expressionBox(expression.base, fonts, size, styleFonts);
      const hasSubAndSup = Boolean(expression.sub && expression.sup);
      const scriptScale = hasSubAndSup ? 0.64 : 0.68;
      const scriptGap = hasSubAndSup ? Math.max(0.8, size * 0.05) : 0;
      const supRaise = hasSubAndSup ? size * 0.54 : size * 0.62;
      const subDrop = hasSubAndSup ? size * 0.38 : size * 0.46;
      const sub = expression.sub ? expressionBox(expression.sub, fonts, size * scriptScale, styleFonts) : undefined;
      const sup = expression.sup ? expressionBox(expression.sup, fonts, size * scriptScale, styleFonts) : undefined;
      const scriptWidth = Math.max(sub?.width ?? 0, sup?.width ?? 0);
      return {
        atom: base.atom,
        ascent: Math.max(base.ascent, (sup?.ascent ?? 0) + supRaise),
        descent: Math.max(base.descent, (sub?.descent ?? 0) + subDrop),
        draw(page, x, baseline) {
          base.draw(page, x, baseline);
          sup?.draw(page, x + base.width + scriptGap, baseline + supRaise);
          sub?.draw(page, x + base.width + scriptGap, baseline - subDrop);
        },
        width: base.width + scriptGap + scriptWidth,
      };
    }
    case 'radical': {
      const value = expressionBox(expression.value, fonts, size, styleFonts);
      const radicalWidth = size * 0.95;
      const valueGap = size * 0.12;
      const degree = expression.degree ? expressionBox(expression.degree, fonts, size * 0.5, styleFonts) : undefined;
      return {
        atom: 'inner',
        ascent: value.ascent + size * 0.22,
        descent: value.descent,
        draw(page, x, baseline) {
          const rootX = x + (degree ? degree.width + size * 0.04 : 0);
          const top = baseline + value.ascent + size * 0.12;
          const notch = baseline - size * 0.22;
          const thickness = 1.25;
          degree?.draw(page, x, baseline + size * 0.5);
          page.drawLine({
            color: rgb(0.12, 0.14, 0.17),
            end: { x: rootX + radicalWidth * 0.34, y: notch },
            start: { x: rootX, y: baseline + size * 0.02 },
            thickness,
          });
          page.drawLine({
            color: rgb(0.12, 0.14, 0.17),
            end: { x: rootX + radicalWidth * 0.82, y: top },
            start: { x: rootX + radicalWidth * 0.34, y: notch },
            thickness,
          });
          drawRule(
            page,
            rootX + radicalWidth * 0.82,
            top - thickness / 2,
            value.width + valueGap + 2,
            thickness,
          );
          value.draw(page, rootX + radicalWidth + valueGap, baseline);
        },
        width: (degree ? degree.width + size * 0.04 : 0) + radicalWidth + valueGap + value.width,
      };
    }
    case 'nary': {
      const operatorText = expression.operator === 'sum'
        ? '∑'
        : expression.operator === 'product'
          ? '∏'
          : expression.operator === 'integral'
            ? '∫'
            : expression.operator;
      const symbolOperator = expression.operator === 'sum'
        || expression.operator === 'product'
        || expression.operator === 'integral';
      const operator = textBox(operatorText, fonts, symbolOperator ? size * 1.45 : size, styleFonts);
      const lower = expression.lower ? expressionBox(expression.lower, fonts, size * 0.55, styleFonts) : undefined;
      const upper = expression.upper ? expressionBox(expression.upper, fonts, size * 0.55, styleFonts) : undefined;
      const body = expressionBox(expression.body, fonts, size, styleFonts);
      const operatorWidth = Math.max(operator.width, lower?.width ?? 0, upper?.width ?? 0);
      const upperBaseline = upper ? (symbolOperator ? size * 1.15 : size * 0.78) + upper.descent : 0;
      const lowerBaseline = lower ? (symbolOperator ? size * 0.72 : size * 0.54) + lower.ascent : 0;
      const bodyGap = body.width > 0 ? (symbolOperator ? 5 : 4) : 0;
      return {
        atom: 'inner',
        ascent: Math.max(
          operator.ascent,
          upper ? upperBaseline + upper.ascent : 0,
        ),
        descent: Math.max(
          operator.descent,
          lower ? lowerBaseline + lower.descent : 0,
        ),
        draw(page, x, baseline) {
          operator.draw(page, x + (operatorWidth - operator.width) / 2, baseline - size * 0.18);
          upper?.draw(page, x + (operatorWidth - upper.width) / 2, baseline + upperBaseline);
          lower?.draw(page, x + (operatorWidth - lower.width) / 2, baseline - lowerBaseline);
          body.draw(page, x + operatorWidth + bodyGap, baseline);
        },
        width: operatorWidth + bodyGap + body.width,
      };
    }
    case 'matrix': {
      const cells = expression.rows.map((row) => row.map((cell) => (
        expressionBox(cell, fonts, size * 0.85, styleFonts)
      )));
      const columns = Math.max(0, ...cells.map((row) => row.length));
      const widths = Array.from({ length: columns }, (_, column) => Math.max(0, ...cells.map((row) => row[column]?.width ?? 0)) + 10);
      const rowHeight = size * 1.35;
      const width = widths.reduce((total, value) => total + value, 0);
      const height = cells.length * rowHeight;
      return {
        atom: 'inner',
        ascent: height / 2,
        descent: height / 2,
        draw(page, x, baseline) {
          const top = baseline + height / 2;
          for (const [rowIndex, row] of cells.entries()) {
            let cursor = x;
            const rowBaseline = top - rowHeight * (rowIndex + 0.75);
            for (const [column, cell] of row.entries()) {
              cell.draw(page, cursor + (widths[column] - cell.width) / 2, rowBaseline);
              cursor += widths[column];
            }
          }
        },
        width,
      };
    }
    default:
      return expression satisfies never;
  }
}

export function createPdfMathLayout(
  node: MathBlockNode | MathInlineNode,
  fonts: PdfFonts,
  size: number,
  environment: PdfMathEnvironment = {},
  styleFonts?: PdfMathStyleFonts,
): PdfMathLayout {
  try {
    return {
      box: expressionBox(
        parseMathNodeExpression(node, environment),
        fonts,
        size,
        styleFonts,
      ),
      fallback: false,
    };
  } catch {
    const fallback = node.fallbackText || node.source;
    const normalizedFallback = normalizeUnicodeDigitScripts(fallback);
    if (normalizedFallback !== fallback) {
      try {
        return {
          box: expressionBox(
            parseMathExpression(normalizedFallback, 'tex'),
            fonts,
            size,
            styleFonts,
          ),
          fallback: true,
        };
      } catch {
        // Preserve the existing visible-text fallback for genuinely unsupported notation.
      }
    }
    return {
      box: textBox(fallback, fonts, size, styleFonts),
      fallback: true,
    };
  }
}
