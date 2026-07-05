import {
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  PDFString,
  rgb,
} from 'pdf-lib';

import {
  type ImageResolution,
  type ImageResolver,
  resolveImageAsset,
} from '../../assets/image-resolver';
import type {
  BlockNode,
  ChatMessage,
  DocumentWarning,
  ImageNode,
  InlineNode,
  ListItem,
  MathBlockNode,
  MathInlineNode,
  TableCell,
  TableRow,
  TextFigureMathToken,
} from '../../document/ast';
import type { ExportRequest } from '../../document/export';
import { normalizeExportRequestForRendering } from '../../document/render-boundary-normalizer';
import {
  getExportStrings,
  type ExportStrings,
} from '../../localization/strings';
import { REFERENCE_EXPORT_PROFILE } from '../export-layout-profile';
import {
  addPdfPage,
  createPdfDocumentFoundation,
  drawPdfTextRun,
  localizedPdfDescription,
  PDF_MARGIN,
  type PdfFoundationOptions,
  savePdfBlob,
} from './pdf-foundation';
import { normalizeUnicodeDigitScripts } from '../math/math-expression';
import { fontFragmentForCodePoint } from './pdf-fonts';
import {
  createPdfMathLayout,
  PDF_MATH_GLYPH_COVERAGE,
  type PdfMathBox,
  type PdfMathEnvironment,
} from './pdf-math-renderer';

type PdfFonts = Awaited<ReturnType<typeof createPdfDocumentFoundation>>['fonts'];
type PdfStyleFonts = Awaited<ReturnType<typeof createPdfDocumentFoundation>>['styleFonts'];

interface TextStyle {
  bold?: boolean;
  code?: boolean;
  color?: 'body' | 'heading' | 'link' | 'muted' | 'sourceLink';
  italic?: boolean;
  link?: string;
  preformatted?: boolean;
  textFigure?: boolean;
  size: number;
  underline?: boolean;
}

interface TextSegment extends TextStyle {
  math?: { node: MathInlineNode; path: number[] };
  text: string;
}

interface DrawRun extends TextStyle {
  font: PDFFont;
  text: string;
  width: number;
}

interface DrawMath extends TextStyle {
  box: PdfMathBox;
  fallback: boolean;
  node: MathInlineNode;
  nodePath: number[];
  width: number;
}

type DrawItem = DrawMath | DrawRun;

interface RenderContext {
  images: ReadonlyMap<ImageNode, ImageResolution>;
  layout: PdfLayout;
  mathEnvironment: PdfMathEnvironment;
  mathWarnings: DocumentWarning[];
  messageId: string;
  strings: ExportStrings;
}

const COLOR = {
  body: rgb(0.12, 0.14, 0.17),
  heading: rgb(0.12, 0.3, 0.47),
  link: rgb(0.14, 0.39, 0.92),
  muted: rgb(0.29, 0.33, 0.39),
  sourceLink: rgb(
    REFERENCE_EXPORT_PROFILE.sourceLink.pdfColor.red,
    REFERENCE_EXPORT_PROFILE.sourceLink.pdfColor.green,
    REFERENCE_EXPORT_PROFILE.sourceLink.pdfColor.blue,
  ),
} as const;

const BODY_SIZE = REFERENCE_EXPORT_PROFILE.body.fontSizePt;
const BODY_LINE_HEIGHT = REFERENCE_EXPORT_PROFILE.body.lineTwips / 20;
const PDF_BODY_LINE_HEIGHT = BODY_LINE_HEIGHT * 1.06;
const BODY_SPACING_AFTER = REFERENCE_EXPORT_PROFILE.body.spacingAfterTwips / 20;
const HEADING_SIZE = Object.fromEntries(
  Object.entries(REFERENCE_EXPORT_PROFILE.headings)
    .map(([level, token]) => [Number(level), token.fontSizePt]),
) as Record<1 | 2 | 3 | 4 | 5 | 6, number>;
const TEXT_FIGURE_SIZE = REFERENCE_EXPORT_PROFILE.textFigure.fontSizePt;
const TEXT_FIGURE_LINE_HEIGHT = REFERENCE_EXPORT_PROFILE.textFigure.lineTwips / 20;
const TITLE_SIZE = REFERENCE_EXPORT_PROFILE.title.fontSizePt;
const MATH_SIZE = REFERENCE_EXPORT_PROFILE.math.fontSizePt;
const SOURCE_LINK_SIZE = REFERENCE_EXPORT_PROFILE.sourceLink.fontSizePt;
export const PDF_SEPARATOR_TOP_GAP = 6;
export const PDF_SEPARATOR_TOTAL_HEIGHT = 30;

function isDrawRun(item: DrawItem): item is DrawRun {
  return 'font' in item;
}

function sameStyle(left: DrawItem, right: TextSegment, font: PDFFont): boolean {
  return isDrawRun(left)
    && left.font === font
    && left.bold === right.bold
    && left.code === right.code
    && left.color === right.color
    && left.italic === right.italic
    && left.link === right.link
    && left.preformatted === right.preformatted
    && left.textFigure === right.textFigure
    && left.size === right.size
    && left.underline === right.underline;
}

function usesStandardCodeFont(segment: TextSegment, character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (segment.code === true || segment.textFigure === true)
    && codePoint >= 0x20
    && codePoint <= 0x7e;
}

function selectedMessages(request: ExportRequest): ChatMessage[] {
  const messages = [...request.document.messages].sort((left, right) => left.order - right.order);
  const selection = request.selection;
  const selected = (() => {
    switch (selection.scope) {
      case 'full-conversation':
        return messages;
      case 'assistant-only':
        return messages.filter(({ role }) => role === 'assistant');
      case 'single-response':
        return messages.filter(({ id }) => id === selection.messageId);
      case 'selected-messages': {
        const ids = new Set(selection.messageIds);
        return messages.filter(({ id }) => ids.has(id));
      }
      default:
        return selection satisfies never;
    }
  })();
  return request.options.includePrompts
    ? selected
    : selected.filter(({ role }) => role !== 'user');
}

function inlineSegments(
  nodes: readonly InlineNode[],
  inherited: Partial<TextStyle> = {},
  path: number[] = [],
): TextSegment[] {
  return nodes.flatMap((node, index): TextSegment[] => {
    const nodePath = [...path, index];
    const base = { color: 'body' as const, size: BODY_SIZE, ...inherited };
    switch (node.kind) {
      case 'text':
        return [{ ...base, text: node.value }];
      case 'strong':
        return inlineSegments(node.children, { ...base, bold: true }, nodePath);
      case 'emphasis':
        return inlineSegments(node.children, { ...base, italic: true }, nodePath);
      case 'inlineCode':
        return [{ ...base, code: true, text: node.value }];
      case 'link': {
        if (node.presentation === 'source') {
          const sourceStyle: TextStyle = {
            ...base,
            color: 'sourceLink',
            link: node.href,
            size: SOURCE_LINK_SIZE,
            underline: true,
          };
          return [
            { ...sourceStyle, text: '(' },
            ...inlineSegments(node.children, sourceStyle, nodePath),
            { ...sourceStyle, text: ')' },
          ];
        }
        return inlineSegments(node.children, {
          ...base,
          color: 'link',
          link: node.href,
          underline: true,
        }, nodePath);
      }
      case 'citation':
        return [{
          ...base,
          color: 'link',
          link: node.href,
          text: node.label,
          underline: true,
        }];
      case 'mathInline':
        return [{ ...base, math: { node, path: nodePath }, text: '' }];
      case 'lineBreak':
        return [{ ...base, text: '\n' }];
      default:
        return node satisfies never;
    }
  });
}

function blockPlainText(node: BlockNode): string {
  switch (node.kind) {
    case 'paragraph':
    case 'heading':
      return inlineSegments(node.children).map((segment) => (
        segment.math
          ? normalizeUnicodeDigitScripts(
            segment.math.node.fallbackText || segment.math.node.source,
          )
          : segment.text
      )).join('');
    case 'blockquote':
      return node.children.map(blockPlainText).join('\n');
    case 'orderedList':
    case 'unorderedList':
      return node.items.flatMap(({ children }) => children.map(blockPlainText)).join('\n');
    case 'table':
      return [node.header, ...node.rows]
        .flatMap(({ cells }) => cells.map((cell) => cell.children.map(blockPlainText).join(' ')))
        .join('\n');
    case 'codeBlock':
      return node.value;
    case 'mathBlock':
      return normalizeUnicodeDigitScripts(node.fallbackText || node.source);
    case 'image':
      return node.alt;
    case 'separator':
    case 'pageBreak':
      return '';
    default:
      return node satisfies never;
  }
}

function* imageNodes(
  nodes: readonly BlockNode[],
  path: number[] = [],
): Generator<{ image: ImageNode; path: number[] }> {
  for (const [index, node] of nodes.entries()) {
    const nodePath = [...path, index];
    if (node.kind === 'image') {
      yield { image: node, path: nodePath };
    } else if (node.kind === 'blockquote') {
      yield* imageNodes(node.children, nodePath);
    } else if (node.kind === 'orderedList' || node.kind === 'unorderedList') {
      for (const [itemIndex, item] of node.items.entries()) {
        yield* imageNodes(item.children, [...nodePath, itemIndex]);
      }
    } else if (node.kind === 'table') {
      for (const [cellIndex, cell] of node.header.cells.entries()) {
        yield* imageNodes(cell.children, [...nodePath, 0, cellIndex]);
      }
      for (const [rowIndex, row] of node.rows.entries()) {
        for (const [cellIndex, cell] of row.cells.entries()) {
          yield* imageNodes(cell.children, [...nodePath, rowIndex + 1, cellIndex]);
        }
      }
    }
  }
}

function inlineNodesContainMath(nodes: readonly InlineNode[]): boolean {
  return nodes.some((node) => {
    if (node.kind === 'mathInline') return true;
    if (node.kind === 'strong' || node.kind === 'emphasis' || node.kind === 'link') {
      return inlineNodesContainMath(node.children);
    }
    return false;
  });
}

function blocksContainMath(nodes: readonly BlockNode[]): boolean {
  return nodes.some((node) => {
    switch (node.kind) {
      case 'paragraph':
      case 'heading':
        return inlineNodesContainMath(node.children);
      case 'mathBlock':
        return true;
      case 'codeBlock':
        return (node.mathTokens?.length ?? 0) > 0;
      case 'blockquote':
        return blocksContainMath(node.children);
      case 'orderedList':
      case 'unorderedList':
        return node.items.some((item) => blocksContainMath(item.children));
      case 'table':
        return [node.header, ...node.rows].some((row) =>
          row.cells.some((cell) => blocksContainMath(cell.children)));
      case 'image':
      case 'pageBreak':
      case 'separator':
        return false;
      default:
        return node satisfies never;
    }
  });
}

class PdfLayout {
  private page: PDFPage;
  private readonly characterWidthCache = new WeakMap<PDFFont, Map<string, number>>();
  private y: number;

  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: PdfFonts,
    private readonly codeFont: PDFFont,
    private readonly styleFonts: PdfStyleFonts,
    private readonly request: ExportRequest,
    private readonly mathEnvironment: PdfMathEnvironment,
  ) {
    this.page = addPdfPage(document, request.options.paper);
    this.y = this.page.getHeight() - PDF_MARGIN;
  }

  get contentWidth(): number {
    return this.page.getWidth() - PDF_MARGIN * 2;
  }

  get contentHeight(): number {
    return this.page.getHeight() - PDF_MARGIN * 2;
  }

  private get availableHeight(): number {
    return this.y - PDF_MARGIN;
  }

  addPage(): void {
    this.page = addPdfPage(this.document, this.request.options.paper);
    this.y = this.page.getHeight() - PDF_MARGIN;
  }

  ensureSpace(height: number): void {
    if (this.y - height < PDF_MARGIN) this.addPage();
  }

  keepTogether(height: number): void {
    if (height <= this.contentHeight && this.availableHeight < height) this.addPage();
  }

  private fontFor(segment: TextSegment, character: string): PDFFont {
    const codePoint = character.codePointAt(0) ?? 0;
    if (usesStandardCodeFont(segment, character)) return this.codeFont;
    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      if (segment.bold && segment.italic) return this.styleFonts.boldItalic;
      if (segment.bold) return this.styleFonts.bold;
      if (segment.italic) return this.styleFonts.italic;
      return this.styleFonts.regular;
    }
    const fragment = fontFragmentForCodePoint(codePoint);
    const styleFragment = fragment === 'cjk-regular' && segment.bold ? 'cjk-bold' : fragment;
    const font = this.fonts.get(styleFragment);
    if (!font) throw new Error(`PDF font fragment ${styleFragment} was not embedded`);
    return font;
  }

  private characterWidth(font: PDFFont, character: string, size: number): number {
    let byFont = this.characterWidthCache.get(font);
    if (!byFont) {
      byFont = new Map<string, number>();
      this.characterWidthCache.set(font, byFont);
    }
    const key = `${size}:${character}`;
    const cached = byFont.get(key);
    if (cached !== undefined) return cached;
    const measured = font.widthOfTextAtSize(character, size);
    byFont.set(key, measured);
    return measured;
  }

  wrap(segments: readonly TextSegment[], maxWidth: number): DrawItem[][] {
    const lines: DrawItem[][] = [];
    let line: DrawItem[] = [];
    let width = 0;
    const flush = () => {
      lines.push(line);
      line = [];
      width = 0;
    };
    for (const segment of segments) {
      if (segment.math) {
        const result = createPdfMathLayout(
          segment.math.node,
          this.fonts,
          segment.size,
          this.mathEnvironment,
          this.styleFonts,
        );
        if (line.length > 0 && width + result.box.width > maxWidth) flush();
        line.push({
          ...segment,
          box: result.box,
          fallback: result.fallback,
          node: segment.math.node,
          nodePath: segment.math.path,
          width: result.box.width,
        });
        width += result.box.width;
        continue;
      }
      for (const character of segment.text) {
        if (character === '\n') {
          flush();
          continue;
        }
        const font = this.fontFor(segment, character);
        const characterWidth = this.characterWidth(font, character, segment.size);
        if (line.length > 0 && width + characterWidth > maxWidth) flush();
        if (line.length === 0 && /^\s$/u.test(character) && !segment.preformatted) continue;
        const previous = line.at(-1);
        if (previous && isDrawRun(previous) && sameStyle(previous, segment, font)) {
          previous.text += character;
          previous.width += characterWidth;
        } else {
          line.push({ ...segment, font, text: character, width: characterWidth });
        }
        width += characterWidth;
      }
    }
    if (line.length > 0 || lines.length === 0) lines.push(line);
    return lines;
  }

  private addLink(x: number, y: number, width: number, height: number, href: string): void {
    const annotation = this.document.context.register(this.document.context.obj({
      A: {
        S: 'URI',
        Type: 'Action',
        URI: PDFString.of(href),
      },
      Border: [0, 0, 0],
      Rect: [x, y, x + width, y + height],
      Subtype: 'Link',
      Type: 'Annot',
    }));
    this.page.node.addAnnot(annotation);
  }

  private drawItems(items: readonly DrawItem[], x: number, y: number): void {
    let cursorX = x;
    for (const item of items) {
      if (!isDrawRun(item)) {
        item.box.draw(this.page, cursorX, y);
        cursorX += item.width;
        continue;
      }
      const run = item;
      if (run.code && !run.preformatted) {
        this.page.drawRectangle({
          color: this.request.options.codeStyle === 'dark'
            ? rgb(0.12, 0.16, 0.23)
            : this.request.options.codeStyle === 'light'
              ? rgb(0.97, 0.98, 0.99)
              : rgb(0.93, 0.95, 0.97),
          height: run.size * 1.25,
          width: run.width + 3,
          x: cursorX - 1.5,
          y: y - 2,
        });
      }
      const options = {
        color: run.code && this.request.options.codeStyle === 'dark'
          ? rgb(0.96, 0.97, 0.98)
          : COLOR[run.color ?? 'body'],
        font: run.font,
        size: run.size,
        text: run.text,
        x: cursorX,
        y,
      };
      drawPdfTextRun(this.page, run.text, options);
      if (run.underline || run.link) {
        this.page.drawLine({
          color: COLOR[run.color ?? 'body'],
          end: { x: cursorX + run.width, y: y - 1.3 },
          start: { x: cursorX, y: y - 1.3 },
          thickness: 0.6,
        });
      }
      if (run.link) this.addLink(cursorX, y - 2, run.width, run.size + 4, run.link);
      cursorX += run.width;
    }
  }

  paragraph(
    segments: readonly TextSegment[],
    options: {
      indent?: number;
      keepWithNextHeight?: number;
      lineHeight?: number;
      spacingAfter?: number;
    } = {},
  ): DrawMath[] {
    const indent = options.indent ?? 0;
    const lines = this.wrap(segments, this.contentWidth - indent);
    const lineHeight = options.lineHeight ?? PDF_BODY_LINE_HEIGHT;
    const lineHeights = this.lineHeights(lines, lineHeight);
    const requiredHeight = this.paragraphRequiredHeight(segments, options);
    if (requiredHeight <= this.contentHeight && this.availableHeight < requiredHeight) {
      this.addPage();
    }
    if (lines.length > 1 && this.availableHeight < lineHeight * 2) this.addPage();
    for (const [index, line] of lines.entries()) {
      const effectiveLineHeight = lineHeights[index];
      const remainingLines = lines.length - index;
      if (remainingLines >= 2 && this.availableHeight < effectiveLineHeight * 2) this.addPage();
      this.ensureSpace(effectiveLineHeight);
      this.drawItems(line, PDF_MARGIN + indent, this.y);
      this.y -= effectiveLineHeight;
    }
    this.y -= options.spacingAfter ?? BODY_SPACING_AFTER;
    return lines.flatMap((line) => line.filter((item): item is DrawMath => (
      !isDrawRun(item) && item.fallback
    )));
  }

  private lineHeights(lines: readonly DrawItem[][], lineHeight: number): number[] {
    return lines.map((line) => Math.max(
      lineHeight,
      Math.max(0, ...line.filter((item): item is DrawMath => !isDrawRun(item))
        .map(({ box }) => box.ascent + box.descent + 4)),
    ));
  }

  paragraphRequiredHeight(
    segments: readonly TextSegment[],
    options: {
      indent?: number;
      keepWithNextHeight?: number;
      lineHeight?: number;
      spacingAfter?: number;
    } = {},
  ): number {
    const indent = options.indent ?? 0;
    const lines = this.wrap(segments, this.contentWidth - indent);
    const lineHeight = options.lineHeight ?? PDF_BODY_LINE_HEIGHT;
    return this.lineHeights(lines, lineHeight)
      .reduce((total, height) => total + height, 0)
      + (options.spacingAfter ?? BODY_SPACING_AFTER)
      + (options.keepWithNextHeight ?? 0);
  }

  heading(text: string, size: number, levelIndent = 0, followingHeight = 0): void {
    this.ensureSpace(size * 1.8 + followingHeight);
    this.paragraph([{
      bold: true,
      color: 'heading',
      size,
      text,
    }], {
      indent: levelIndent,
      lineHeight: size * 1.35,
      spacingAfter: size * 0.45,
    });
  }

  preformattedRequiredHeight(value: string, size: number, code = true): number {
    const lineHeight = code ? size * 1.35 : TEXT_FIGURE_LINE_HEIGHT;
    return Math.max(1, value.split('\n').length) * lineHeight + 10;
  }

  preformattedSegments(
    segments: readonly TextSegment[],
    size: number,
    code: boolean,
  ): DrawMath[] {
    const lineHeight = code ? size * 1.35 : TEXT_FIGURE_LINE_HEIGHT;
    const lines = this.wrap(segments, this.contentWidth);
    const totalHeight = lines.length * lineHeight + 10;
    if (totalHeight <= this.contentHeight && this.availableHeight < totalHeight) this.addPage();

    const fallbacks: DrawMath[] = [];
    let index = 0;
    while (index < lines.length) {
      if (this.availableHeight < lineHeight) this.addPage();
      const capacity = Math.max(1, Math.floor(this.availableHeight / lineHeight));
      const chunk = lines.slice(index, index + capacity);
      if (code) {
        const height = chunk.length * lineHeight + 5;
        this.page.drawRectangle({
          color: this.request.options.codeStyle === 'dark'
            ? rgb(0.12, 0.16, 0.23)
            : this.request.options.codeStyle === 'light'
              ? rgb(0.97, 0.98, 0.99)
              : rgb(0.93, 0.95, 0.97),
          height,
          width: this.contentWidth,
          x: PDF_MARGIN,
          y: this.y - height + size,
        });
      }
      for (const line of chunk) {
        this.drawItems(line, PDF_MARGIN, this.y);
        fallbacks.push(...line.filter((item): item is DrawMath => !isDrawRun(item) && item.fallback));
        this.y -= lineHeight;
      }
      index += chunk.length;
      if (index < lines.length) this.addPage();
    }
    this.y -= 10;
    return fallbacks;
  }

  preformatted(value: string, size: number, code: boolean): DrawMath[] {
    return this.preformattedSegments([{
      code,
      color: 'body',
      preformatted: true,
      size,
      text: value,
      textFigure: !code,
    }], size, code);
  }

  separator(): void {
    this.ensureSpace(PDF_SEPARATOR_TOTAL_HEIGHT);
    this.page.drawLine({
      color: rgb(0.18, 0.2, 0.23),
      end: { x: PDF_MARGIN + this.contentWidth, y: this.y - PDF_SEPARATOR_TOP_GAP },
      start: { x: PDF_MARGIN, y: this.y - PDF_SEPARATOR_TOP_GAP },
      thickness: 1,
    });
    this.y -= PDF_SEPARATOR_TOTAL_HEIGHT;
  }

  quote(segments: readonly TextSegment[]): DrawMath[] {
    const fallbacks = this.paragraph(
      segments,
      { indent: 12, spacingAfter: 8 },
    );
    return fallbacks;
  }

  tableRow(
    cells: readonly { segments: TextSegment[]; span: number }[],
    columns: number,
    header: boolean,
  ): void {
    const columnWidth = this.contentWidth / columns;
    const wrapped = cells.map(({ segments, span }) => this.wrap(
      segments.map((segment) => ({ ...segment, size: 8.5 })),
      columnWidth * span - 8,
    ));
    const remaining = wrapped.map((lines) => [...lines]);
    let firstChunk = true;
    while (firstChunk || remaining.some((lines) => lines.length > 0)) {
      firstChunk = false;
      let maxLines = Math.floor((this.availableHeight - 8) / 11);
      if (maxLines < 1) {
        this.addPage();
        maxLines = Math.floor((this.availableHeight - 8) / 11);
      }
      const remainingLineCount = Math.max(1, ...remaining.map((lines) => lines.length));
      const chunkSize = Math.max(1, Math.min(maxLines, remainingLineCount));
      const rowHeight = Math.max(24, chunkSize * 11 + 8);
      let x = PDF_MARGIN;
      for (const [index, cell] of cells.entries()) {
        const width = columnWidth * cell.span;
        this.page.drawRectangle({
          borderColor: rgb(0.82, 0.84, 0.87),
          borderWidth: 0.6,
          color: header ? rgb(0.92, 0.93, 0.95) : rgb(1, 1, 1),
          height: rowHeight,
          width,
          x,
          y: this.y - rowHeight,
        });
        let lineY = this.y - 13;
        for (const line of remaining[index].splice(0, chunkSize)) {
          this.drawItems(line, x + 4, lineY);
          lineY -= 11;
        }
        x += width;
      }
      this.y -= rowHeight;
      if (remaining.some((lines) => lines.length > 0)) this.addPage();
    }
  }

  async image(
    node: ImageNode,
    resolution: ImageResolution,
    strings: ExportStrings,
  ): Promise<void> {
    if (resolution.status === 'fallback') {
      this.paragraph([{
        color: resolution.href ? 'link' : 'muted',
        italic: true,
        link: resolution.href,
        size: 10,
        text: strings.imageUnavailable(node.alt || undefined),
        underline: Boolean(resolution.href),
      }]);
      return;
    }
    const image = await this.document.embedPng(resolution.data);
    const scale = this.imageScale(resolution);
    const width = resolution.width * scale;
    const height = resolution.height * scale;
    this.ensureSpace(height + 50);
    this.page.drawImage(image, {
      height,
      width,
      x: PDF_MARGIN,
      y: this.y - height,
    });
    this.y -= height + 26;
    if (node.alt) {
      this.paragraph([{ color: 'muted', italic: true, size: 9, text: node.alt }]);
    }
  }

  imageRequiredHeight(resolution: ImageResolution): number {
    if (resolution.status === 'fallback') return 36;
    return resolution.height * this.imageScale(resolution) + 50;
  }

  private imageScale(resolution: Extract<ImageResolution, { status: 'embedded' }>): number {
    const maximumHeight = this.contentHeight - 100;
    return Math.min(
      1,
      this.contentWidth / resolution.width,
      maximumHeight / resolution.height,
    );
  }

  math(
    node: MathBlockNode,
    environment: PdfMathEnvironment,
    nextMath?: MathBlockNode,
  ): boolean {
    const result = createPdfMathLayout(node, this.fonts, MATH_SIZE, environment, this.styleFonts);
    const height = result.box.ascent + result.box.descent + 13;
    if (nextMath) {
      const next = createPdfMathLayout(
        nextMath,
        this.fonts,
        MATH_SIZE,
        environment,
        this.styleFonts,
      );
      const combinedHeight = height + next.box.ascent + next.box.descent + 13;
      if (combinedHeight <= this.contentHeight && this.availableHeight < combinedHeight) {
        this.addPage();
      }
    }
    this.ensureSpace(height);
    result.box.draw(
      this.page,
      PDF_MARGIN + Math.max(0, (this.contentWidth - result.box.width) / 2),
      this.y - result.box.ascent,
    );
    this.y -= height;
    return result.fallback;
  }
}

function cellSegments(cell: TableCell): TextSegment[] {
  const text = cell.children.map(blockPlainText).join(' ').trim();
  return [{ color: 'body', size: 8.5, text }];
}

function rowCells(row: TableRow): { segments: TextSegment[]; span: number }[] {
  return row.cells.map((cell) => ({
    segments: cellSegments(cell),
    span: cell.columnSpan ?? 1,
  }));
}

function textFigurePdfSize(): number {
  return TEXT_FIGURE_SIZE;
}

function textFigureSegments(
  value: string,
  mathTokens: readonly TextFigureMathToken[] = [],
  size: number,
  nodePath: number[],
): TextSegment[] {
  const lines = value.split('\n');
  return lines.flatMap((line, lineIndex) => {
    const tokens = mathTokens
      .filter((token) => token.line === lineIndex)
      .sort((left, right) => left.start - right.start);
    let cursor = 0;
    const segments: TextSegment[] = [];
    for (const token of tokens) {
      if (token.start > cursor) {
        segments.push({
          color: 'body',
          preformatted: true,
          size,
          text: line.slice(cursor, token.start),
          textFigure: true,
        });
      }
      segments.push({
        color: 'body',
        math: { node: token.math, path: [...nodePath, token.line, token.start] },
        preformatted: true,
        size,
        text: '',
        textFigure: true,
      });
      cursor = token.end;
    }
    if (cursor < line.length) {
      segments.push({
        color: 'body',
        preformatted: true,
        size,
        text: line.slice(cursor),
        textFigure: true,
      });
    }
    if (lineIndex < lines.length - 1) {
      segments.push({
        color: 'body',
        preformatted: true,
        size,
        text: '\n',
        textFigure: true,
      });
    }
    return segments;
  });
}

function tableColumns(row: TableRow): number {
  return row.cells.reduce((total, cell) => total + (cell.columnSpan ?? 1), 0);
}

function recordInlineMathFallbacks(
  context: RenderContext,
  fallbacks: readonly DrawMath[],
): void {
  for (const fallback of fallbacks) {
    context.mathWarnings.push({
      code: 'math-fallback',
      message: context.strings.pdfMathFallbackWarning,
      provenance: {
        messageId: context.messageId,
        nodePath: fallback.nodePath,
        sourceKind: fallback.node.kind,
        stage: 'render',
      },
    });
  }
}

function renderListItem(
  item: ListItem,
  context: RenderContext,
  marker: string,
  level: number,
): Promise<void> {
  return (async () => {
    let marked = false;
    for (const child of item.children) {
      if (child.kind === 'paragraph') {
        const segments = inlineSegments(child.children);
        recordInlineMathFallbacks(context, context.layout.paragraph([
          ...(marked ? [] : [{ color: 'body' as const, size: BODY_SIZE, text: `${marker} ` }]),
          ...segments,
        ], { indent: level * 18 }));
        marked = true;
      } else if (child.kind === 'orderedList' || child.kind === 'unorderedList') {
        await renderList(child, context, level + 1);
      } else {
        await renderBlock(child, context);
      }
    }
  })();
}

async function renderList(
  node: Extract<BlockNode, { kind: 'orderedList' | 'unorderedList' }>,
  context: RenderContext,
  level = 0,
): Promise<void> {
  for (const [index, item] of node.items.entries()) {
    const marker = node.kind === 'orderedList' ? `${node.start + index}.` : '\u2022';
    await renderListItem(item, context, marker, level);
  }
}

function listRequiredHeight(
  node: Extract<BlockNode, { kind: 'orderedList' | 'unorderedList' }>,
  context: RenderContext,
  level = 0,
): number {
  return node.items.reduce((total, item, index) => {
    const marker = node.kind === 'orderedList' ? `${node.start + index}.` : '\u2022';
    return total + item.children.reduce((itemTotal, child, childIndex) => {
      if (child.kind === 'paragraph') {
        return itemTotal + context.layout.paragraphRequiredHeight([
          ...(childIndex === 0 ? [{ color: 'body' as const, size: BODY_SIZE, text: `${marker} ` }] : []),
          ...inlineSegments(child.children),
        ], { indent: level * 18 });
      }
      if (child.kind === 'orderedList' || child.kind === 'unorderedList') {
        return itemTotal + listRequiredHeight(child, context, level + 1);
      }
      return itemTotal + blockRequiredHeight(child, context);
    }, 0);
  }, 0);
}

function codeBlockRequiredHeight(node: Extract<BlockNode, { kind: 'codeBlock' }>, context: RenderContext): number {
  const longestLine = Math.max(1, ...node.value.split('\n').map((line) => [...line].length));
  const code = node.presentation !== 'textFigure';
  const size = code
    ? Math.max(7, Math.min(9, 9 * 82 / longestLine))
    : textFigurePdfSize();
  return context.layout.preformattedRequiredHeight(node.value, size, code);
}

function blockRequiredHeight(node: BlockNode, context: RenderContext): number {
  switch (node.kind) {
    case 'paragraph':
      return context.layout.paragraphRequiredHeight(inlineSegments(node.children));
    case 'heading': {
      const size = HEADING_SIZE[node.level];
      return context.layout.paragraphRequiredHeight(
        inlineSegments(node.children, { bold: true, size }),
        { lineHeight: size * 1.35, spacingAfter: size * 0.45 },
      );
    }
    case 'blockquote':
      return node.children.reduce((total, child) => total + blockRequiredHeight(child, context), 0) + 4;
    case 'orderedList':
    case 'unorderedList':
      return listRequiredHeight(node, context);
    case 'codeBlock':
      return codeBlockRequiredHeight(node, context);
    case 'mathBlock':
      return 32;
    case 'image':
      return context.layout.imageRequiredHeight(context.images.get(node) ?? {
        status: 'fallback',
        warning: {
          code: 'image-unavailable',
          message: context.strings.imageDecodingUnavailable,
          provenance: { sourceKind: 'image', stage: 'render' },
        },
      });
    case 'separator':
      return 18;
    case 'pageBreak':
      return context.layout.contentHeight;
    case 'table':
      return 48 + node.rows.length * 24;
    default:
      return node satisfies never;
  }
}

function keepFinalTailTogether(
  nodes: readonly BlockNode[],
  index: number,
  context: RenderContext,
): void {
  const lastSectionStart = nodes.findLastIndex((node) => node.kind === 'heading');
  const previousSectionStart = lastSectionStart > 0
    ? nodes.slice(0, lastSectionStart).findLastIndex((node) => node.kind === 'heading')
    : -1;
  const tailStart = lastSectionStart >= 0 && nodes.length - lastSectionStart <= 8
    ? previousSectionStart >= 0 && lastSectionStart - previousSectionStart <= 8
      ? previousSectionStart
      : lastSectionStart
    : Math.max(0, nodes.length - 6);
  if (index !== tailStart || nodes.length - index < 2) return;
  const height = nodes.slice(index).reduce((total, node) =>
    total + blockRequiredHeight(node, context), 0);
  context.layout.keepTogether(height);
}

async function renderBlock(
  node: BlockNode,
  context: RenderContext,
  nodePath: number[] = [],
  nextNode?: BlockNode,
): Promise<void> {
  switch (node.kind) {
    case 'paragraph':
      {
        const followingHeight = nextNode?.kind === 'codeBlock'
          && nextNode.presentation === 'textFigure'
          ? context.layout.preformattedRequiredHeight(
              nextNode.value,
              textFigurePdfSize(),
              false,
            )
          : 0;
      recordInlineMathFallbacks(
        context,
        context.layout.paragraph(inlineSegments(node.children, {}, nodePath), {
          keepWithNextHeight: followingHeight,
        }),
      );
      return;
      }
    case 'heading': {
      const size = HEADING_SIZE[node.level];
      const segments = inlineSegments(node.children, { bold: true, size }, nodePath);
      if (segments.some(({ math }) => math)) {
        recordInlineMathFallbacks(context, context.layout.paragraph(segments, {
          lineHeight: size * 1.35,
          spacingAfter: size * 0.45,
        }));
      } else {
        context.layout.heading(
          segments.map(({ text }) => text).join(''),
          size,
          0,
          nextNode?.kind === 'image'
            ? context.layout.imageRequiredHeight(context.images.get(nextNode) ?? {
              status: 'fallback',
              warning: {
                code: 'image-unavailable',
                message: context.strings.imageDecodingUnavailable,
                provenance: { sourceKind: 'image', stage: 'render' },
              },
            })
            : nextNode?.kind === 'codeBlock' && nextNode.presentation === 'textFigure'
              ? context.layout.preformattedRequiredHeight(
                  nextNode.value,
                  textFigurePdfSize(),
                  false,
                )
              : 36,
        );
      }
      return;
    }
    case 'blockquote':
      for (const [index, child] of node.children.entries()) {
        if (child.kind === 'paragraph') {
          recordInlineMathFallbacks(
            context,
            context.layout.quote(inlineSegments(child.children, {}, [...nodePath, index])),
          );
        } else {
          await renderBlock(
            child,
            context,
            [...nodePath, index],
            node.children[index + 1],
          );
        }
      }
      return;
    case 'orderedList':
    case 'unorderedList':
      await renderList(node, context);
      return;
    case 'table': {
      const columns = tableColumns(node.header);
      context.layout.tableRow(rowCells(node.header), columns, true);
      for (const row of node.rows) context.layout.tableRow(rowCells(row), columns, false);
      context.layout.paragraph([{ color: 'body', size: 4, text: ' ' }], { spacingAfter: 4 });
      return;
    }
    case 'codeBlock':
      {
        const longestLine = Math.max(1, ...node.value.split('\n').map((line) => [...line].length));
        const code = node.presentation !== 'textFigure';
        const size = code
          ? Math.max(7, Math.min(9, 9 * 82 / longestLine))
          : textFigurePdfSize();
        const fallbacks = code || !node.mathTokens?.length
          ? context.layout.preformatted(node.value.replace(/\t/gu, '    '), size, code)
          : context.layout.preformattedSegments(
              textFigureSegments(
                node.value.replace(/\t/gu, '    '),
                node.mathTokens,
                size,
                nodePath,
              ),
              size,
              false,
            );
        recordInlineMathFallbacks(
          context,
          fallbacks,
        );
        return;
      }
    case 'mathBlock':
      if (context.layout.math(
        node,
        context.mathEnvironment,
        nextNode?.kind === 'mathBlock' ? nextNode : undefined,
      )) {
        context.mathWarnings.push({
          code: 'math-fallback',
          message: context.strings.pdfMathFallbackWarning,
          provenance: {
            messageId: context.messageId,
            nodePath,
            sourceKind: node.kind,
            stage: 'render',
          },
        });
      }
      return;
    case 'image':
      await context.layout.image(node, context.images.get(node) ?? {
        status: 'fallback',
        warning: {
          code: 'image-unavailable',
          message: context.strings.imageDecodingUnavailable,
          provenance: { sourceKind: 'image', stage: 'render' },
        },
      }, context.strings);
      return;
    case 'separator':
      context.layout.separator();
      return;
    case 'pageBreak':
      context.layout.addPage();
      return;
    default:
      return node satisfies never;
  }
}

export interface StructuredPdfOptions extends PdfFoundationOptions {
  imageResolver?: ImageResolver;
  mathEnvironment?: PdfMathEnvironment;
  signal?: AbortSignal;
}

export interface StructuredPdfResult {
  blob: Blob;
  warnings: DocumentWarning[];
}

export async function renderStructuredPdf(
  request: ExportRequest,
  options: StructuredPdfOptions = {},
): Promise<StructuredPdfResult> {
  const renderRequest = normalizeExportRequestForRendering(request);
  const messages = selectedMessages(renderRequest);
  const strings = getExportStrings(renderRequest.options.language);
  const images = new Map<ImageNode, ImageResolution>();
  const imageWarnings: DocumentWarning[] = [];
  const resolver = options.imageResolver ?? resolveImageAsset;
  for (const message of messages) {
    options.signal?.throwIfAborted();
    for (const entry of imageNodes(message.content)) {
      options.signal?.throwIfAborted();
      const resolution = await resolver(entry.image, {
        language: request.options.language,
        messageId: message.id,
        nodePath: entry.path,
      });
      images.set(entry.image, resolution);
      if (resolution.status === 'fallback') imageWarnings.push(resolution.warning);
    }
  }

  const labels = { assistant: strings.assistant, user: strings.user };
  const hasMathContent = messages.some((message) => blocksContainMath(message.content));
  const allTextParts = [
    renderRequest.document.title,
    localizedPdfDescription(renderRequest.options.language),
    ...messages.flatMap((message) => [
      labels[message.role],
      ...message.content.map(blockPlainText),
    ]),
  ];
  if (hasMathContent) allTextParts.push(PDF_MATH_GLYPH_COVERAGE);
  const allText = allTextParts.join('\n');
  const foundation = await createPdfDocumentFoundation(renderRequest, allText, options);
  options.signal?.throwIfAborted();
  const layout = new PdfLayout(
    foundation.document,
    foundation.fonts,
    foundation.codeFont,
    foundation.styleFonts,
    renderRequest,
    options.mathEnvironment ?? {},
  );
  const includeDocumentChrome = renderRequest.selection.scope !== 'single-response';
  if (includeDocumentChrome) {
    layout.heading(renderRequest.document.title, TITLE_SIZE);
    layout.paragraph([{
      color: 'muted',
      size: 9,
      text: localizedPdfDescription(renderRequest.options.language),
    }], { spacingAfter: 14 });
  }
  const mathWarnings: DocumentWarning[] = [];
  for (const message of messages) {
    options.signal?.throwIfAborted();
    if (includeDocumentChrome) layout.heading(labels[message.role], HEADING_SIZE[3]);
    const context: RenderContext = {
      images,
      layout,
      mathEnvironment: options.mathEnvironment ?? {},
      mathWarnings,
      messageId: message.id,
      strings,
    };
    for (const [index, node] of message.content.entries()) {
      options.signal?.throwIfAborted();
      keepFinalTailTogether(message.content, index, context);
      await renderBlock(node, context, [index], message.content[index + 1]);
    }
  }

  options.signal?.throwIfAborted();
  return {
    blob: await savePdfBlob(foundation.document),
    warnings: [...renderRequest.document.warnings, ...imageWarnings, ...mathWarnings],
  };
}

export async function renderStructuredPdfBlob(
  request: ExportRequest,
  options: StructuredPdfOptions = {},
): Promise<Blob> {
  return (await renderStructuredPdf(request, options)).blob;
}
