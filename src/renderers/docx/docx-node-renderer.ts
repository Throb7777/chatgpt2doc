import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  type FileChild,
  HeadingLevel,
  ImageRun,
  type INumberingOptions,
  LevelFormat,
  PageBreak,
  Paragraph,
  type ParagraphChild,
  Table,
  TableCell,
  TableRow,
  Tab,
  TextRun,
  WidthType,
} from 'docx';

import type {
  BlockNode,
  ChatMessage,
  DocumentWarning,
  ImageNode,
  InlineNode,
  ListItem,
  MathInlineNode,
  TableCell as AstTableCell,
  TableRow as AstTableRow,
  TextFigureMathToken,
} from '../../document/ast';
import type { ExportRequest } from '../../document/export';
import { normalizeExportRequestForRendering } from '../../document/render-boundary-normalizer';
import {
  getExportStrings,
  type ExportStrings,
} from '../../localization/strings';
import {
  resolveImageAsset,
  type ImageResolution,
  type ImageResolver,
} from '../../assets/image-resolver';
import { REFERENCE_EXPORT_PROFILE } from '../export-layout-profile';
import { renderDocxBlob } from './docx-foundation';
import {
  type MathFallbackResolution,
  type MathFallbackResolver,
  type MathNode,
  resolveMathFallback,
} from './math-fallback';
import {
  createEditableWordMathFromNode,
  createEditableWordMathParagraphFromNode,
} from './math-to-omml';

const HEADING_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
} as const;

interface RenderContext {
  codeStyle: ExportRequest['options']['codeStyle'];
  images: ReadonlyMap<ImageNode, ImageResolution>;
  isWpsClipboard: boolean;
  listIndent: {
    hanging: number;
    leftBase: number;
    leftStep: number;
  };
  mathFallbacks: ReadonlyMap<MathNode, MathFallbackResolution>;
  nextNumberingId: number;
  numbering: INumberingOptions['config'][number][];
  strings: ExportStrings;
}

const DEFAULT_LIST_INDENT = {
  hanging: 360,
  leftBase: 720,
  leftStep: 360,
};

const WPS_CLIPBOARD_LIST_INDENT = {
  hanging: 260,
  leftBase: 520,
  leftStep: 300,
};

function createRenderContext(
  images: ReadonlyMap<ImageNode, ImageResolution> = new Map(),
  mathFallbacks: ReadonlyMap<MathNode, MathFallbackResolution> = new Map(),
  strings: ExportStrings = getExportStrings('en'),
  codeStyle: ExportRequest['options']['codeStyle'] = 'document',
  profile: StructuredDocxOptions['profile'] = 'default',
): RenderContext {
  return {
    codeStyle,
    images,
    isWpsClipboard: profile === 'wps-clipboard',
    listIndent: profile === 'wps-clipboard'
      ? WPS_CLIPBOARD_LIST_INDENT
      : DEFAULT_LIST_INDENT,
    mathFallbacks,
    nextNumberingId: 1,
    numbering: [],
    strings,
  };
}

function codeFont(character: string): string {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint <= 0x024f || (codePoint >= 0x2500 && codePoint <= 0x259f)) {
    return 'Cascadia Mono';
  }
  if (
    (codePoint >= 0x2190 && codePoint <= 0x2bff)
    || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
  ) {
    return 'Segoe UI Symbol';
  }
  return 'Microsoft YaHei';
}

function codeLineRuns(line: string, size: number): TextRun[] {
  const runs: TextRun[] = [];
  let group: { font: string; value: string } | undefined;
  const flush = () => {
    if (group) runs.push(new TextRun({ font: group.font, size, text: group.value }));
    group = undefined;
  };
  for (const character of line) {
    if (character === '\t') {
      flush();
      runs.push(new TextRun({ children: [new Tab()], font: 'Cascadia Mono', size }));
      continue;
    }
    const font = codeFont(character);
    if (group?.font === font) group.value += character;
    else {
      flush();
      group = { font, value: character };
    }
  }
  flush();
  return runs;
}

function codeBlockRuns(value: string): TextRun[] {
  const lines = value.split('\n');
  const longestLine = Math.max(1, ...lines.map((line) => [...line].length));
  const size = Math.max(14, Math.min(19, Math.floor(19 * 88 / longestLine)));
  return lines.flatMap((line, index) => [
    ...(index > 0 ? [new TextRun({ break: 1, size })] : []),
    ...codeLineRuns(line, size),
  ]);
}

const TEXT_FIGURE_SIZE = REFERENCE_EXPORT_PROFILE.textFigure.docxHalfPoints;
const TEXT_FIGURE_ASCII_FONT = REFERENCE_EXPORT_PROFILE.fonts.code;
const TEXT_FIGURE_CJK_FONT = REFERENCE_EXPORT_PROFILE.fonts.cjk;
const SOURCE_LINK_STYLE = REFERENCE_EXPORT_PROFILE.sourceLink;

interface InlineRunStyle {
  bold?: boolean;
  color?: string;
  italics?: boolean;
  size?: number;
  underline?: Record<string, never>;
}

function textFigurePlainRuns(value: string): TextRun[] {
  return value.split('\t').flatMap((part, partIndex) => [
    ...(partIndex > 0
      ? [new TextRun({ children: [new Tab()], font: TEXT_FIGURE_ASCII_FONT, size: TEXT_FIGURE_SIZE })]
      : []),
    ...(part ? [new TextRun({
      font: /[\u3400-\u9fff]/u.test(part) ? TEXT_FIGURE_CJK_FONT : TEXT_FIGURE_ASCII_FONT,
      size: TEXT_FIGURE_SIZE,
      text: part,
    })] : []),
  ]);
}

function textFigureRuns(
  value: string,
  mathTokens: readonly TextFigureMathToken[] = [],
  context: RenderContext,
): ParagraphChild[] {
  const lines = value.split('\n');
  return lines.flatMap((line, index) => {
    const tokens = mathTokens
      .filter((token) => token.line === index)
      .sort((left, right) => left.start - right.start);
    let cursor = 0;
    const runs: ParagraphChild[] = [
      ...(index > 0
        ? [new TextRun({ break: 1, font: TEXT_FIGURE_ASCII_FONT, size: TEXT_FIGURE_SIZE })]
        : []),
    ];
    for (const token of tokens) {
      if (token.start > cursor) {
        runs.push(...textFigurePlainRuns(line.slice(cursor, token.start)));
      }
      runs.push(renderMath(token.math, context));
      cursor = token.end;
    }
    if (cursor < line.length) runs.push(...textFigurePlainRuns(line.slice(cursor)));
    return runs;
  });
}

function orderedNumbering(
  context: RenderContext,
  start: number,
): string {
  const reference = `chat-export-numbering-${context.nextNumberingId}`;
  context.nextNumberingId += 1;
  context.numbering.push({
    levels: Array.from({ length: 9 }, (_, level) => ({
      alignment: 'start' as const,
      format: LevelFormat.DECIMAL,
      level,
      start,
      style: {
        paragraph: {
          indent: {
            hanging: context.listIndent.hanging,
            left: context.listIndent.leftBase + level * context.listIndent.leftStep,
          },
        },
      },
      text: `%${level + 1}.`,
    })),
    reference,
  });
  return reference;
}

function renderInline(
  node: InlineNode,
  context: RenderContext,
  inherited: InlineRunStyle = {},
): ParagraphChild[] {
  switch (node.kind) {
    case 'text':
      return [new TextRun({ ...inherited, text: node.value })];
    case 'strong':
      return node.children.flatMap((child) => renderInline(child, context, {
        ...inherited,
        bold: true,
      }));
    case 'emphasis':
      return node.children.flatMap((child) => renderInline(child, context, {
        ...inherited,
        italics: true,
      }));
    case 'inlineCode':
      return [new TextRun({
        ...inherited,
        font: 'Cascadia Mono',
        shading: { fill: 'F3F4F6' },
        text: node.value,
      })];
    case 'link': {
      if (node.presentation === 'source') {
        const sourceStyle: InlineRunStyle = {
          color: SOURCE_LINK_STYLE.docxColor,
          size: SOURCE_LINK_STYLE.docxHalfPoints,
          underline: {},
        };
        return [new ExternalHyperlink({
          children: [
            new TextRun({ ...sourceStyle, text: '(' }),
            ...node.children.flatMap((child) => renderInline(child, context, sourceStyle))
              .filter((child): child is TextRun => child instanceof TextRun),
            new TextRun({ ...sourceStyle, text: ')' }),
          ],
          link: node.href,
        })];
      }
      return [new ExternalHyperlink({
        children: node.children.flatMap((child) => renderInline(child, context))
          .filter((child): child is TextRun => child instanceof TextRun),
        link: node.href,
      })];
    }
    case 'citation':
      return [new ExternalHyperlink({
        children: [new TextRun({ color: '2563EB', text: node.label, underline: {} })],
        link: node.href,
      })];
    case 'mathInline':
      return [renderMath(node, context, inherited)];
    case 'lineBreak':
      return [new TextRun({ break: 1 })];
    default:
      return node satisfies never;
  }
}

function renderMath(
  node: MathNode,
  context: RenderContext,
  inherited: { bold?: boolean; italics?: boolean } = {},
): ParagraphChild {
  const editable = createEditableWordMathFromNode(
    node,
    undefined,
    { profile: context.isWpsClipboard ? 'wps-clipboard' : 'default' },
  );
  if (editable) return editable;
  const fallback = context.mathFallbacks.get(node);
  if (fallback?.status === 'embedded') {
    const label = node.fallbackText || node.source || context.strings.unsupportedEquation;
    return new ImageRun({
      altText: {
        description: label,
        name: context.strings.unsupportedEquationFallbackName,
        title: label,
      },
      data: fallback.svgData,
      fallback: {
        data: fallback.pngData,
        type: 'png',
      },
      transformation: {
        height: fallback.height,
        width: fallback.width,
      },
      type: 'svg',
    });
  }
  return new TextRun({
    ...inherited,
    italics: true,
    text: node.fallbackText || node.source,
  });
}

function listItemBlocks(
  item: ListItem,
  ordered: boolean,
  level: number,
  context: RenderContext,
  numberingReference?: string,
): FileChild[] {
  return item.children.flatMap((child, index) => {
    if (child.kind === 'paragraph') {
      const indent = {
        hanging: context.listIndent.hanging,
        left: context.listIndent.leftBase + level * context.listIndent.leftStep,
      };
      const paragraphIndent = context.isWpsClipboard
        ? { indent }
        : index > 0
          ? { indent: { left: DEFAULT_LIST_INDENT.leftBase + level * DEFAULT_LIST_INDENT.leftStep } }
          : {};
      return [new Paragraph({
        ...(ordered
          ? { numbering: { level, reference: numberingReference! } }
          : { bullet: { level } }),
        children: child.children.flatMap((inline) => renderInline(inline, context)),
        ...paragraphIndent,
      })];
    }
    if (child.kind === 'orderedList' || child.kind === 'unorderedList') {
      return renderList(child, level + 1, context);
    }
    return renderBlock(child, context);
  });
}

function renderList(
  node: Extract<BlockNode, { kind: 'orderedList' | 'unorderedList' }>,
  level = 0,
  context: RenderContext = createRenderContext(),
): FileChild[] {
  const ordered = node.kind === 'orderedList';
  const reference = ordered ? orderedNumbering(context, node.start) : undefined;
  return node.items.flatMap((item) => (
    listItemBlocks(item, ordered, level, context, reference)
  ));
}

function tableCellParagraphs(
  cell: AstTableCell,
  context: RenderContext,
): (Paragraph | Table)[] {
  const alignment = cell.alignment
    ? {
        center: AlignmentType.CENTER,
        left: AlignmentType.LEFT,
        right: AlignmentType.RIGHT,
      }[cell.alignment]
    : undefined;
  const rendered = cell.children.flatMap((child) => (
    child.kind === 'paragraph' && alignment
      ? [new Paragraph({
          alignment,
          children: child.children.flatMap((inline) => renderInline(inline, context)),
        })]
      : renderBlock(child, context)
  ));
  const supported = rendered.filter(
    (child): child is Paragraph | Table => child instanceof Paragraph || child instanceof Table,
  );
  return supported.length > 0 ? supported : [new Paragraph('')];
}

function renderTableRow(
  row: AstTableRow,
  context: RenderContext,
  header = false,
): TableRow {
  return new TableRow({
    cantSplit: true,
    tableHeader: header,
    children: row.cells.map((cell) => new TableCell({
      children: tableCellParagraphs(cell, context),
      ...(cell.columnSpan ? { columnSpan: cell.columnSpan } : {}),
      ...(cell.rowSpan ? { rowSpan: cell.rowSpan } : {}),
      ...(header ? { shading: { fill: 'E5E7EB' } } : {}),
    })),
  });
}

function renderBlock(
  node: BlockNode,
  context: RenderContext = createRenderContext(),
  options: { keepNext?: boolean } = {},
): FileChild[] {
  switch (node.kind) {
    case 'paragraph':
      return [new Paragraph({
        children: node.children.flatMap((inline) => renderInline(inline, context)),
        ...(options.keepNext ? { keepNext: true } : {}),
      })];
    case 'heading':
      return [new Paragraph({
        children: node.children.flatMap((inline) => renderInline(inline, context)),
        heading: HEADING_LEVEL[node.level],
        ...(options.keepNext ? { keepNext: true } : {}),
      })];
    case 'blockquote':
      return node.children.flatMap((child) => (
        child.kind === 'paragraph'
          ? [new Paragraph({
              children: child.children.flatMap((inline) => renderInline(inline, context)),
              style: 'ChatExportQuote',
            })]
          : renderBlock(child, context)
      ));
    case 'orderedList':
    case 'unorderedList':
      return renderList(node, 0, context);
    case 'table':
      return [new Table({
        borders: {
          bottom: { color: 'D1D5DB', size: 4, style: BorderStyle.SINGLE },
          insideHorizontal: { color: 'D1D5DB', size: 4, style: BorderStyle.SINGLE },
          insideVertical: { color: 'D1D5DB', size: 4, style: BorderStyle.SINGLE },
          left: { color: 'D1D5DB', size: 4, style: BorderStyle.SINGLE },
          right: { color: 'D1D5DB', size: 4, style: BorderStyle.SINGLE },
          top: { color: 'D1D5DB', size: 4, style: BorderStyle.SINGLE },
        },
        rows: [
          renderTableRow(node.header, context, true),
          ...node.rows.map((row) => renderTableRow(row, context)),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
      })];
    case 'codeBlock':
      return [new Paragraph({
        children: node.presentation === 'textFigure'
          ? textFigureRuns(node.value, node.mathTokens, context)
          : codeBlockRuns(node.value),
        style: node.presentation === 'textFigure'
          ? 'ChatExportTextFigure'
          : 'ChatExportCode',
      })];
    case 'mathBlock': {
      const editable = createEditableWordMathParagraphFromNode(
        node,
        undefined,
        { profile: context.isWpsClipboard ? 'wps-clipboard' : 'default' },
      );
      return [new Paragraph({
        children: [editable
          ? editable as unknown as ParagraphChild
          : renderMath(node, context)],
        style: 'ChatExportMath',
      })];
    }
    case 'image':
      {
        const resolution = context.images.get(node);
        if (resolution?.status === 'embedded') {
          return [new Paragraph({
            children: [new ImageRun({
              altText: {
                description: node.alt,
                name: node.alt || 'Chat image',
                title: node.title ?? node.alt,
              },
              data: resolution.data,
              transformation: {
                height: resolution.height,
                width: resolution.width,
              },
              type: 'png',
            })],
          })];
        }
        const label = context.strings.imageUnavailable(node.alt || undefined);
        if (resolution?.status === 'fallback' && resolution.href) {
          return [new Paragraph({
            children: [new ExternalHyperlink({
              children: [new TextRun({
                color: '2563EB',
                italics: true,
                text: label,
                underline: {},
              })],
              link: resolution.href,
            })],
          })];
        }
        return [new Paragraph({
          children: [new TextRun({ italics: true, text: label })],
        })];
      }
    case 'separator':
      return [new Paragraph({ thematicBreak: true })];
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })];
    default:
      return node satisfies never;
  }
}

function renderMessageBlocks(
  nodes: readonly BlockNode[],
  context: RenderContext,
): FileChild[] {
  return nodes.flatMap((node, index) => {
    const next = nodes[index + 1];
    return renderBlock(node, context, {
      keepNext: next?.kind === 'codeBlock' && next.presentation === 'textFigure',
    });
  });
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

export function renderDocxMessageContent(request: ExportRequest): FileChild[] {
  return renderDocxContent(request).children;
}

function renderDocxContent(
  request: ExportRequest,
  images: ReadonlyMap<ImageNode, ImageResolution> = new Map(),
  mathFallbacks: ReadonlyMap<MathNode, MathFallbackResolution> = new Map(),
  profile: StructuredDocxOptions['profile'] = 'default',
): {
  children: FileChild[];
  numbering: INumberingOptions;
} {
  const strings = getExportStrings(request.options.language);
  const labels = { assistant: strings.assistant, user: strings.user };
  const context = createRenderContext(
    images,
    mathFallbacks,
    strings,
    request.options.codeStyle,
    profile,
  );
  const includeRoleHeadings = request.selection.scope !== 'single-response';
  const children = selectedMessages(request).flatMap((message) => [
    ...(includeRoleHeadings ? [new Paragraph({
      heading: HeadingLevel.HEADING_2,
      text: labels[message.role],
    })] : []),
    ...renderMessageBlocks(message.content, context),
  ]);
  return { children, numbering: { config: context.numbering } };
}

function* inlineMathNodes(
  nodes: readonly InlineNode[],
  path: number[],
): Generator<{ math: MathInlineNode; path: number[] }> {
  for (const [index, node] of nodes.entries()) {
    const nodePath = [...path, index];
    if (node.kind === 'mathInline') {
      yield { math: node, path: nodePath };
    } else if (
      node.kind === 'strong'
      || node.kind === 'emphasis'
      || node.kind === 'link'
    ) {
      yield* inlineMathNodes(node.children, nodePath);
    }
  }
}

function* mathNodes(
  nodes: readonly BlockNode[],
  path: number[] = [],
): Generator<{ math: MathNode; path: number[] }> {
  for (const [index, node] of nodes.entries()) {
    const nodePath = [...path, index];
    if (node.kind === 'mathBlock') {
      yield { math: node, path: nodePath };
    } else if (node.kind === 'codeBlock') {
      for (const token of node.mathTokens ?? []) {
        yield { math: token.math, path: [...nodePath, token.line, token.start] };
      }
    } else if (node.kind === 'paragraph' || node.kind === 'heading') {
      yield* inlineMathNodes(node.children, nodePath);
    } else if (node.kind === 'blockquote') {
      yield* mathNodes(node.children, nodePath);
    } else if (node.kind === 'orderedList' || node.kind === 'unorderedList') {
      for (const [itemIndex, item] of node.items.entries()) {
        yield* mathNodes(item.children, [...nodePath, itemIndex]);
      }
    } else if (node.kind === 'table') {
      for (const [cellIndex, cell] of node.header.cells.entries()) {
        yield* mathNodes(cell.children, [...nodePath, 0, cellIndex]);
      }
      for (const [rowIndex, row] of node.rows.entries()) {
        for (const [cellIndex, cell] of row.cells.entries()) {
          yield* mathNodes(cell.children, [...nodePath, rowIndex + 1, cellIndex]);
        }
      }
    }
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

function* emptyCodeBlockWarnings(
  nodes: readonly BlockNode[],
  path: number[] = [],
): Generator<DocumentWarning> {
  for (const [index, node] of nodes.entries()) {
    const nodePath = [...path, index];
    if (node.kind === 'codeBlock' && node.value.trim().length === 0) {
      yield {
        code: 'unsupported-content',
        message: 'An empty preformatted block was preserved as an empty local export block.',
        provenance: {
          nodePath,
          sourceKind: 'codeBlock',
          stage: 'render',
        },
      };
    } else if (node.kind === 'blockquote') {
      yield* emptyCodeBlockWarnings(node.children, nodePath);
    } else if (node.kind === 'orderedList' || node.kind === 'unorderedList') {
      for (const [itemIndex, item] of node.items.entries()) {
        yield* emptyCodeBlockWarnings(item.children, [...nodePath, itemIndex]);
      }
    } else if (node.kind === 'table') {
      for (const [cellIndex, cell] of node.header.cells.entries()) {
        yield* emptyCodeBlockWarnings(cell.children, [...nodePath, 0, cellIndex]);
      }
      for (const [rowIndex, row] of node.rows.entries()) {
        for (const [cellIndex, cell] of row.cells.entries()) {
          yield* emptyCodeBlockWarnings(cell.children, [...nodePath, rowIndex + 1, cellIndex]);
        }
      }
    }
  }
}

export interface StructuredDocxOptions {
  imageResolver?: ImageResolver;
  mathFallbackResolver?: MathFallbackResolver;
  profile?: 'default' | 'wps-clipboard';
  signal?: AbortSignal;
}

export interface StructuredDocxResult {
  blob: Blob;
  warnings: DocumentWarning[];
}

export async function renderStructuredDocx(
  request: ExportRequest,
  options: StructuredDocxOptions = {},
): Promise<StructuredDocxResult> {
  const renderRequest = normalizeExportRequestForRendering(request);
  const resolver = options.imageResolver ?? resolveImageAsset;
  const mathResolver = options.mathFallbackResolver ?? resolveMathFallback;
  const images = new Map<ImageNode, ImageResolution>();
  const mathFallbacks = new Map<MathNode, MathFallbackResolution>();
  const imageWarnings: DocumentWarning[] = [];
  const mathWarnings: DocumentWarning[] = [];
  const emptyWarnings: DocumentWarning[] = [];
  for (const message of selectedMessages(renderRequest)) {
    options.signal?.throwIfAborted();
    for (const warning of emptyCodeBlockWarnings(message.content)) {
      emptyWarnings.push({
        ...warning,
        provenance: { ...warning.provenance, messageId: message.id },
      });
    }
    for (const entry of imageNodes(message.content)) {
      options.signal?.throwIfAborted();
      const result = await resolver(entry.image, {
        language: request.options.language,
        messageId: message.id,
        nodePath: entry.path,
      });
      images.set(entry.image, result);
      if (result.status === 'fallback') imageWarnings.push(result.warning);
    }
    for (const entry of mathNodes(message.content)) {
      options.signal?.throwIfAborted();
      if (createEditableWordMathFromNode(entry.math)) continue;
      const result = await mathResolver(entry.math, {
        language: renderRequest.options.language,
        messageId: message.id,
        nodePath: entry.path,
      });
      mathFallbacks.set(entry.math, result);
      mathWarnings.push(result.warning);
    }
  }
  const content = renderDocxContent(renderRequest, images, mathFallbacks, options.profile);
  options.signal?.throwIfAborted();
  const blob = await renderDocxBlob(
    renderRequest,
    content.children,
    { numbering: content.numbering, profile: options.profile },
  );
  options.signal?.throwIfAborted();
  return {
    blob,
    warnings: [
      ...request.document.warnings,
      ...emptyWarnings,
      ...imageWarnings,
      ...mathWarnings,
    ],
  };
}

export async function renderStructuredDocxBlob(
  request: ExportRequest,
  options: StructuredDocxOptions = {},
): Promise<Blob> {
  return (await renderStructuredDocx(request, options)).blob;
}
