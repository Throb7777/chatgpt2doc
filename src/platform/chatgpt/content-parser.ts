import type {
  BlockNode,
  DocumentWarning,
  ImageNode,
  InlineNode,
  ListItem,
  ParagraphNode,
  TableCell,
  TableRow,
} from '../../document/ast';
import type { ExportLanguage } from '../../document/export';
import {
  inferMathSpans,
  shouldPromoteInferredMathBlock,
  splitInferredMath,
} from '../../document/math-inference';
import {
  getExportStrings,
  type ExportStrings,
} from '../../localization/strings';
import { CHATGPT_SELECTORS } from './selectors';

export interface ParsedMessageContent {
  content: BlockNode[];
  warnings: DocumentWarning[];
}

const BLOCK_TAGS = new Set([
  'BLOCKQUOTE',
  'DIV',
  'FIGURE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'IMG',
  'OL',
  'P',
  'PRE',
  'SVG',
  'TABLE',
  'UL',
]);

const SUPPORTED_TAGS = new Set([
  ...BLOCK_TAGS,
  'A',
  'B',
  'BR',
  'CODE',
  'EM',
  'FIGCAPTION',
  'I',
  'LI',
  'MAIN',
  'MATH',
  'SECTION',
  'SPAN',
  'STRONG',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
]);

const NON_CONTENT_TAGS = new Set([
  'DATALIST',
  'FIELDSET',
  'FORM',
  'INPUT',
  'NOSCRIPT',
  'OPTION',
  'SELECT',
  'SCRIPT',
  'STYLE',
  'TEMPLATE',
  'TEXTAREA',
]);
function tagName(element: Element): string {
  return element.tagName.toUpperCase();
}

interface MathDescriptor {
  display: 'block' | 'inline';
  fallbackText: string;
  source: string;
  sourceFormat: 'mathml' | 'tex';
}

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  0: '⁰',
  1: '¹',
  2: '²',
  3: '³',
  4: '⁴',
  5: '⁵',
  6: '⁶',
  7: '⁷',
  8: '⁸',
  9: '⁹',
};

const SUBSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  0: '₀',
  1: '₁',
  2: '₂',
  3: '₃',
  4: '₄',
  5: '₅',
  6: '₆',
  7: '₇',
  8: '₈',
  9: '₉',
};

function isHiddenFromContent(element: Element): boolean {
  return element.closest('[aria-hidden="true"]') !== null;
}

function isExtensionUiElement(element: Element): boolean {
  return element.closest(CHATGPT_SELECTORS.extensionUi) !== null;
}

function isExcludedFromContent(element: Element): boolean {
  return isExtensionUiElement(element)
    || element.closest(CHATGPT_SELECTORS.messageNonContent) !== null;
}

function visibleFallback(element: Element, strings: ExportStrings): string {
  const label = element.getAttribute('aria-label')
    ?? element.getAttribute('alt')
    ?? element.getAttribute('title');
  const tag = tagName(element).toLowerCase();
  return strings.unsupportedFallback(tag, label || undefined);
}

function compactInline(nodes: InlineNode[]): InlineNode[] {
  const compacted: InlineNode[] = [];
  for (const node of nodes) {
    const previous = compacted.at(-1);
    if (node.kind === 'text' && previous?.kind === 'text') {
      previous.value += node.value;
    } else {
      compacted.push(node);
    }
  }

  const first = compacted[0];
  if (first?.kind === 'text') first.value = first.value.replace(/^\s+/, '');
  const last = compacted.at(-1);
  if (last?.kind === 'text') last.value = last.value.replace(/\s+$/, '');
  return compacted.filter((node) => node.kind !== 'text' || node.value.length > 0);
}

function inlineTextForFormattedMath(node: InlineNode): string | null {
  if (node.kind === 'text') return node.value;
  if (node.kind !== 'strong' && node.kind !== 'emphasis') return null;
  const text = node.children.map((child) => child.kind === 'text' ? child.value : null);
  return text.every((value): value is string => value !== null) ? text.join('') : null;
}

function slicedInlineTextNode(node: InlineNode, value: string): InlineNode[] {
  if (!value) return [];
  if (node.kind === 'text') return [{ kind: 'text', value }];
  if (node.kind === 'strong') return [{ kind: 'strong', children: [{ kind: 'text', value }] }];
  if (node.kind === 'emphasis') return [{ kind: 'emphasis', children: [{ kind: 'text', value }] }];
  return [];
}

function isFormattedMathSeparator(character: string): boolean {
  return /^[\s\u00a0\u200b-\u200d\ufeff]$/u.test(character);
}

function isFormattedMathJoinCharacter(character: string): boolean {
  return /^[A-Za-z0-9_^\p{Script=Greek}()[\]{},+\-\u2212\u00b1\u00d7\u00f7/=\u2208\u2209\u2229\u222a\u2264\u2265\u2260\u2248\u2261\u2282\u2286\u2283\u2287\u2192\u2190\u2194\u2191\u2193]$/u.test(character);
}

function isFormattedMathOperatorOrDelimiter(character: string): boolean {
  return /^[()[\]{},+\-\u2212\u00b1\u00d7\u00f7/=\u2208\u2209\u2229\u222a\u2264\u2265\u2260\u2248\u2261\u2282\u2286\u2283\u2287\u2192\u2190\u2194\u2191\u2193]$/u.test(character);
}

function isFormattedMathClosingDelimiter(character: string): boolean {
  return /^[)\]}]$/u.test(character);
}

function normalizeFormattedMathCandidate(value: string): { text: string; rawOffsets: number[] } {
  const characters = [...value];
  const output: string[] = [];
  const rawOffsets: number[] = [];
  let rawOffset = 0;
  const rawCharacterOffsets = characters.map((character) => {
    const offset = rawOffset;
    rawOffset += character.length;
    return offset;
  });

  characters.forEach((character, index) => {
    const previous = [...characters.slice(0, index)].reverse()
      .find((candidate) => !isFormattedMathSeparator(candidate));
    const next = characters.slice(index + 1)
      .find((candidate) => !isFormattedMathSeparator(candidate));
    const ignorableSeparator = isFormattedMathSeparator(character)
      && previous !== undefined
      && next !== undefined
      && isFormattedMathJoinCharacter(previous)
      && isFormattedMathJoinCharacter(next)
      && (
        isFormattedMathOperatorOrDelimiter(next)
        || (isFormattedMathOperatorOrDelimiter(previous)
          && !isFormattedMathClosingDelimiter(previous))
      );
    if (ignorableSeparator) return;
    output.push(character);
    rawOffsets.push(rawCharacterOffsets[index]!);
  });

  return { rawOffsets, text: output.join('') };
}

function inferFormattedInlineMath(nodes: InlineNode[], standalone = false): InlineNode[] {
  const output: InlineNode[] = [];
  let index = 0;

  while (index < nodes.length) {
    const firstText = inlineTextForFormattedMath(nodes[index]!);
    if (firstText === null) {
      output.push(nodes[index]!);
      index += 1;
      continue;
    }

    const run: InlineNode[] = [];
    const texts: string[] = [];
    let hasFormattedOwner = false;
    while (index < nodes.length) {
      const node = nodes[index]!;
      const text = inlineTextForFormattedMath(node);
      if (text === null) break;
      run.push(node);
      texts.push(text);
      hasFormattedOwner ||= node.kind === 'strong' || node.kind === 'emphasis';
      index += 1;
    }

    if (!hasFormattedOwner) {
      output.push(...run);
      continue;
    }

    let runOffset = 0;
    const chunks = run.map((node, chunkIndex) => {
      const text = texts[chunkIndex]!;
      const start = runOffset;
      runOffset += text.length;
      return {
        end: runOffset,
        node,
        start,
        text,
      };
    });
    const normalized = normalizeFormattedMathCandidate(texts.join(''));
    const spans = inferMathSpans(
      normalized.text,
      standalone && normalized.text.trim() === normalized.text,
    );
    if (spans.length === 0) {
      output.push(...run);
      continue;
    }

    let cursor = 0;
    for (const span of spans) {
      const spanStart = normalized.rawOffsets[span.start];
      const lastRawOffset = normalized.rawOffsets[span.end - 1];
      if (spanStart === undefined || lastRawOffset === undefined) continue;
      const spanEnd = lastRawOffset + [...normalized.text[span.end - 1]!][0]!.length;
      for (const chunk of chunks) {
        const start = Math.max(cursor, chunk.start);
        const end = Math.min(spanStart, chunk.end);
        if (start < end) {
          output.push(...slicedInlineTextNode(
            chunk.node,
            chunk.text.slice(start - chunk.start, end - chunk.start),
          ));
        }
      }
      output.push(span.node);
      cursor = spanEnd;
    }

    for (const chunk of chunks) {
      const start = Math.max(cursor, chunk.start);
      const end = chunk.end;
      if (start < end) {
        output.push(...slicedInlineTextNode(
          chunk.node,
          chunk.text.slice(start - chunk.start, end - chunk.start),
        ));
      }
    }
  }

  return compactInline(output);
}

function scriptText(element: Element, digits: Readonly<Record<string, string>>): string {
  const text = mathText(element);
  return [...text].map((character) => digits[character] ?? character).join('');
}

function mathChildText(element: Element, index: number): string {
  const child = element.children[index];
  return child ? mathText(child) : '';
}

function scriptChildText(
  element: Element,
  index: number,
  digits: Readonly<Record<string, string>>,
): string {
  const child = element.children[index];
  return child ? scriptText(child, digits) : '';
}

function mathText(element: Element): string {
  const children = () => [...element.children].map(mathText).join('');
  switch (element.localName.toLowerCase()) {
    case 'annotation':
      return '';
    case 'mfrac':
      return `${mathChildText(element, 0)}/${mathChildText(element, 1)}`;
    case 'msqrt':
      return `sqrt(${children()})`;
    case 'mroot':
      return `${mathChildText(element, 1)}sqrt(${mathChildText(element, 0)})`;
    case 'msup':
      return `${mathChildText(element, 0)}${scriptChildText(element, 1, SUPERSCRIPT_DIGITS)}`;
    case 'msub':
      return `${mathChildText(element, 0)}${scriptChildText(element, 1, SUBSCRIPT_DIGITS)}`;
    case 'msubsup':
      return [
        mathChildText(element, 0),
        scriptChildText(element, 1, SUBSCRIPT_DIGITS),
        scriptChildText(element, 2, SUPERSCRIPT_DIGITS),
      ].join('');
    case 'mtable':
      return [...element.children].map((row) => (
        [...row.children].map(mathText).join(', ')
      )).join('; ');
    default:
      return element.children.length > 0
        ? children()
        : element.textContent?.trim() ?? '';
  }
}

const MATH_ROOT_SELECTOR = [
  'math',
  '[data-math-source]',
  '.katex',
  '.katex-display',
  'mjx-container',
].join(', ');

function isMathRoot(element: Element): boolean {
  return element.matches(MATH_ROOT_SELECTOR);
}

function mathDescriptor(element: Element): MathDescriptor | null {
  if (isHiddenFromContent(element)) return null;
  if (!isMathRoot(element)) return null;
  const math = element.matches('math') ? element : element.querySelector('math');
  const annotation = element.querySelector(
    'annotation[encoding="application/x-tex"], annotation[encoding="application/x-tex; mode=display"]',
  );
  const source = element.getAttribute('data-math-source')
    ?? annotation?.textContent?.trim()
    ?? math?.outerHTML
    ?? '';
  if (!source) return null;
  const fallbackText = element.getAttribute('aria-label')
    ?? element.getAttribute('data-math-fallback')
    ?? (math ? mathText(math) : element.textContent?.trim())
    ?? source;
  const sourceFormat = element.getAttribute('data-math-source') || annotation
    ? 'tex'
    : math
      ? 'mathml'
      : 'tex';
  return {
    display: element.getAttribute('data-math-display') === 'block'
      || element.classList.contains('katex-display')
      ? 'block'
      : 'inline',
    fallbackText,
    source,
    sourceFormat,
  };
}

function isInsideRecognizedMath(element: Element): boolean {
  const mathRoot = element.parentElement?.closest(MATH_ROOT_SELECTOR);
  return mathRoot ? mathDescriptor(mathRoot) !== null : false;
}

function astMathFields(
  descriptor: MathDescriptor,
): Omit<MathDescriptor, 'display'> & { provenance: 'explicit' } {
  return {
    fallbackText: descriptor.fallbackText,
    provenance: 'explicit',
    source: descriptor.source,
    sourceFormat: descriptor.sourceFormat,
  };
}

interface ParserCache {
  citationSourceHint: WeakMap<Element, boolean>;
  decorativeCitationInlineAsset: WeakMap<Element, boolean>;
  exportActionLikeControl: WeakMap<Element, boolean>;
  nearbySiblingSourceLabel: WeakMap<Element, string>;
  renderedPixelDimensions: WeakMap<Element, { height: number; width: number } | null>;
  smallInlineAsset: WeakMap<Element, boolean>;
  sourceChipLabel: WeakMap<Element, string>;
}

let activeParserCache: ParserCache | null = null;

function createParserCache(): ParserCache {
  return {
    citationSourceHint: new WeakMap(),
    decorativeCitationInlineAsset: new WeakMap(),
    exportActionLikeControl: new WeakMap(),
    nearbySiblingSourceLabel: new WeakMap(),
    renderedPixelDimensions: new WeakMap(),
    smallInlineAsset: new WeakMap(),
    sourceChipLabel: new WeakMap(),
  };
}

function withParserCache<T>(callback: () => T): T {
  if (activeParserCache) return callback();
  activeParserCache = createParserCache();
  try {
    return callback();
  } finally {
    activeParserCache = null;
  }
}

function inlineAssetLabel(element: Element): string {
  return [
    element.getAttribute('alt'),
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
  ].find((value) => value?.trim())?.trim() ?? '';
}

function numericAttribute(element: Element, name: string): number | null {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function cssPixelDimension(element: Element, name: 'height' | 'width'): number | null {
  const style = element.getAttribute('style') ?? '';
  const match = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([0-9.]+)px\\b`, 'i').exec(style);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function computedPixelDimension(element: Element, name: 'height' | 'width'): number | null {
  const view = element.ownerDocument.defaultView;
  if (!view) return null;
  const value = view.getComputedStyle(element).getPropertyValue(name).trim();
  const match = /^([0-9.]+)px$/i.exec(value);
  if (!match) return null;
  const pixels = Number(match[1]);
  return Number.isFinite(pixels) && pixels > 0 ? pixels : null;
}

function renderedPixelDimensions(element: Element): { height: number; width: number } | null {
  const cached = activeParserCache?.renderedPixelDimensions.get(element);
  if (cached !== undefined) return cached;
  const bounds = element.getBoundingClientRect();
  if (Number.isFinite(bounds.width) && bounds.width > 0
    && Number.isFinite(bounds.height) && bounds.height > 0) {
    const rendered = { height: bounds.height, width: bounds.width };
    activeParserCache?.renderedPixelDimensions.set(element, rendered);
    return rendered;
  }

  const width = computedPixelDimension(element, 'width')
    ?? cssPixelDimension(element, 'width');
  const height = computedPixelDimension(element, 'height')
    ?? cssPixelDimension(element, 'height');
  const rendered = width !== null && height !== null ? { height, width } : null;
  activeParserCache?.renderedPixelDimensions.set(element, rendered);
  return rendered;
}

function iconAssetHint(element: Element): boolean {
  const haystack = [
    element.getAttribute('class'),
    element.getAttribute('src'),
    element.getAttribute('href'),
    element.getAttribute('data-testid'),
    element.getAttribute('aria-label'),
    ...[...element.attributes]
      .filter((attribute) => attribute.name.startsWith('data-'))
      .flatMap((attribute) => [attribute.name, attribute.value]),
  ].filter(Boolean).join(' ').toLowerCase();
  return /\b(favicon|icon|logo|source|citation|reference)\b/.test(haystack);
}

function isSmallInlineAsset(element: Element): boolean {
  const cached = activeParserCache?.smallInlineAsset.get(element);
  if (cached !== undefined) return cached;
  const rendered = renderedPixelDimensions(element);
  if (rendered) {
    const small = rendered.width <= 32 && rendered.height <= 32;
    activeParserCache?.smallInlineAsset.set(element, small);
    return small;
  }

  const width = numericAttribute(element, 'width');
  const height = numericAttribute(element, 'height');
  const small = (() => {
    if (width === null && height === null) {
      return tagName(element) === 'SVG' || iconAssetHint(element);
    }
    return (width ?? 0) <= 32 && (height ?? 0) <= 32;
  })();
  activeParserCache?.smallInlineAsset.set(element, small);
  return small;
}

function hasCitationSourceHint(element: Element): boolean {
  const cached = activeParserCache?.citationSourceHint.get(element);
  if (cached !== undefined) return cached;
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < 6) {
    const haystack = [
      current.getAttribute('class'),
      current.getAttribute('data-testid'),
      current.getAttribute('aria-label'),
      current.getAttribute('title'),
      ...[...current.attributes]
        .filter((attribute) => attribute.name.startsWith('data-'))
        .flatMap((attribute) => [attribute.name, attribute.value]),
    ].filter(Boolean).join(' ').toLowerCase();
    if (/\b(citation|source|sources|reference|references)\b/.test(haystack)) {
      activeParserCache?.citationSourceHint.set(element, true);
      return true;
    }
    if (tagName(current) === 'P' || tagName(current) === 'ARTICLE' || tagName(current) === 'MAIN') {
      activeParserCache?.citationSourceHint.set(element, false);
      return false;
    }
    current = current.parentElement;
    depth += 1;
  }
  activeParserCache?.citationSourceHint.set(element, false);
  return false;
}

function nodeText(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) return node.nodeValue?.trim() ?? '';
  const view = node.ownerDocument?.defaultView;
  if (!view || !(node instanceof view.Element)) return '';
  if (isExportActionLikeControl(node) || isExcludedFromContent(node) || isHiddenFromContent(node)) {
    return '';
  }
  return node.textContent?.trim() ?? '';
}

function isShortSourceLabel(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 && normalized.length <= 64;
}

function localControlText(element: Element): string {
  const attributeText = [
    element.getAttribute('aria-label'),
    element.getAttribute('alt'),
    element.getAttribute('title'),
    element.getAttribute('role'),
    element.getAttribute('class'),
    ...[...element.attributes]
      .filter((attribute) => attribute.name.startsWith('data-'))
      .flatMap((attribute) => [attribute.name, attribute.value]),
    ...[...element.querySelectorAll('img, svg')]
      .flatMap((asset) => [
        asset.getAttribute('alt'),
        asset.getAttribute('aria-label'),
        asset.getAttribute('title'),
        asset.getAttribute('class'),
      ]),
  ].filter(Boolean).join(' ');
  return `${element.textContent ?? ''} ${attributeText}`.replace(/\s+/g, ' ').trim();
}

function isExportActionLikeControl(element: Element): boolean {
  const cached = activeParserCache?.exportActionLikeControl.get(element);
  if (cached !== undefined) return cached;

  const normalizedTag = tagName(element);
  const role = element.getAttribute('role')?.toLowerCase();
  const hasDirectControlShape = normalizedTag === 'BUTTON'
    || role === 'button'
    || role === 'menuitem'
    || element.matches('[type="button"], [type="submit"]');
  const smallContainerWithControl = (
    normalizedTag === 'DIV'
    || normalizedTag === 'SPAN'
    || normalizedTag === 'SECTION'
  )
    && element.childElementCount <= 8
    && element.querySelector('button, [role="button"], [role="menuitem"], img, svg') !== null;
  if (!hasDirectControlShape && !smallContainerWithControl) {
    activeParserCache?.exportActionLikeControl.set(element, false);
    return false;
  }

  const text = localControlText(element);
  const normalized = text.toLowerCase();
  const explicitExportAction = /\bexport\s+response\b/u.test(normalized)
    || /\bcreate\s+(?:word|pdf)\s+docs?\b/u.test(normalized)
    || /\bexport\s+(?:as\s+)?(?:docx|pdf|word)\b/u.test(normalized)
    || /\b(?:word|pdf)\s+file\b/u.test(normalized);
  const actionAndFormat = /\b(?:export|download|create)\b/u.test(normalized)
    && /\b(?:docx|pdf|word)\b/u.test(normalized);
  const exportLike = explicitExportAction || actionAndFormat;
  activeParserCache?.exportActionLikeControl.set(element, exportLike);
  return exportLike;
}

function isOpaqueLocalReferenceButton(element: Element): boolean {
  if (tagName(element) !== 'BUTTON'
    || element.getAttribute('type')?.toLowerCase() !== 'button'
    || element.hasAttribute('href')
    || element.querySelector('a[href]')
    || element.getAttribute('aria-label')?.trim()
    || element.getAttribute('title')?.trim()) {
    return false;
  }

  let iconCount = 0;
  let label = '';
  for (const child of element.children) {
    if (tagName(child) === 'SVG') {
      iconCount += 1;
    } else if (tagName(child) === 'P'
      && child.classList.contains('not-prose')
      && child.classList.contains('truncate')) {
      label = child.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }
  }
  if (iconCount !== 1 || !label) return false;
  const spriteUse = element.querySelector(':scope > svg use[href*="#554074"], :scope > svg use[href*="sprites-core"]');
  const chatGptAttachmentChip = Boolean(spriteUse)
    && element.classList.contains('ms-1')
    && element.classList.contains('rounded-xl');
  if (chatGptAttachmentChip) return true;
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{1,12}(?:…|\.{3})?$/iu.test(label)
    || /^粘贴的文本(?:\s*\(\d+\))?$/u.test(label);
}

function sourceChipLabel(element: Element): string {
  const cached = activeParserCache?.sourceChipLabel.get(element);
  if (cached !== undefined) return cached;
  if (isExportActionLikeControl(element)) {
    activeParserCache?.sourceChipLabel.set(element, '');
    return '';
  }
  if (isOpaqueLocalReferenceButton(element)) {
    activeParserCache?.sourceChipLabel.set(element, '');
    return '';
  }
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < 6 && tagName(current) !== 'P') {
    if (isExportActionLikeControl(current)) {
      activeParserCache?.sourceChipLabel.set(element, '');
      return '';
    }
    if (isOpaqueLocalReferenceButton(current)) {
      activeParserCache?.sourceChipLabel.set(element, '');
      return '';
    }
    const currentTag = tagName(current);
    if ((currentTag === 'A' || currentTag === 'BUTTON' || currentTag === 'SPAN')
      && current.childElementCount <= 8) {
      const text = current.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (!isShortSourceLabel(text)) {
        current = current.parentElement;
        depth += 1;
        continue;
      }
      const inlineImageCount = current.querySelectorAll('img, svg').length;
      const isChipLike = inlineImageCount <= 2
        && inlineImageCount > 0
        && !/[。；;!?！？]\s*$/u.test(text);
      if (isChipLike) {
        activeParserCache?.sourceChipLabel.set(element, text);
        return text;
      }
    }
    current = current.parentElement;
    depth += 1;
  }
  activeParserCache?.sourceChipLabel.set(element, '');
  return '';
}

function nearbySiblingSourceLabel(element: Element): string {
  const cached = activeParserCache?.nearbySiblingSourceLabel.get(element);
  if (cached !== undefined) return cached;
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < 6 && tagName(current) !== 'P') {
    for (const direction of ['nextSibling', 'previousSibling'] as const) {
      let sibling: Node | null = current[direction];
      let inspected = 0;
      while (sibling && inspected < 3) {
        const text = nodeText(sibling);
        if (text) {
          const siblingElement = sibling.nodeType === sibling.ELEMENT_NODE
            ? sibling as Element
            : null;
          const hasSourceStructure = siblingElement?.matches('a[href]') === true
            || (siblingElement ? hasCitationSourceHint(siblingElement) : false);
          if (hasSourceStructure && isShortSourceLabel(text)) {
            activeParserCache?.nearbySiblingSourceLabel.set(element, text);
            return text;
          }
          break;
        }
        sibling = sibling[direction];
        inspected += 1;
      }
    }
    current = current.parentElement;
    depth += 1;
  }
  activeParserCache?.nearbySiblingSourceLabel.set(element, '');
  return '';
}

function isDecorativeCitationInlineAsset(element: Element): boolean {
  const cached = activeParserCache?.decorativeCitationInlineAsset.get(element);
  if (cached !== undefined) return cached;
  const normalizedTag = tagName(element);
  if (normalizedTag !== 'IMG' && normalizedTag !== 'SVG') {
    activeParserCache?.decorativeCitationInlineAsset.set(element, false);
    return false;
  }
  const label = inlineAssetLabel(element);
  const labelIsDecorative = !label
    || /^(image|icon|favicon|source|citation|reference|logo)$/i.test(label);
  if (!labelIsDecorative) {
    activeParserCache?.decorativeCitationInlineAsset.set(element, false);
    return false;
  }

  const anchor = element.closest('a[href]');
  const anchorText = anchor?.textContent?.trim() ?? '';
  const siblingSourceLabel = nearbySiblingSourceLabel(element);
  const chipSourceLabel = sourceChipLabel(element);
  const hasVisibleSourceLabel = anchorText.length > 0
    || siblingSourceLabel.length > 0
    || chipSourceLabel.length > 0;
  const decorative = hasVisibleSourceLabel
    && isSmallInlineAsset(element)
    && (hasCitationSourceHint(element)
      || anchor !== null
      || siblingSourceLabel.length > 0
      || chipSourceLabel.length > 0);
  activeParserCache?.decorativeCitationInlineAsset.set(element, decorative);
  return decorative;
}

function isSourceChipElement(element: Element): boolean {
  return sourceChipLabel(element).length > 0;
}

function isSourceLinkElement(element: Element): boolean {
  if (tagName(element) !== 'A') return false;
  const label = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (!isShortSourceLabel(label)) return false;
  if (sourceChipLabel(element) || hasCitationSourceHint(element)) return true;

  for (const direction of ['nextSibling', 'previousSibling'] as const) {
    let sibling: Node | null = element[direction];
    let inspected = 0;
    while (sibling && inspected < 3) {
      if (sibling.nodeType === sibling.ELEMENT_NODE) {
        const siblingElement = sibling as Element;
        const assets = siblingElement.matches('img, svg')
          ? [siblingElement]
          : [...siblingElement.querySelectorAll('img, svg')];
        if (assets.some((asset) => isDecorativeCitationInlineAsset(asset))) return true;
      }
      if (nodeText(sibling)) break;
      sibling = sibling[direction];
      inspected += 1;
    }
  }
  return false;
}

function isStandaloneTextNode(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent?.matches('p, li, div')) return false;
  if (parent.children.length > 0) return false;
  return parent.textContent?.trim() === node.nodeValue?.trim();
}

function parseInlineNode(
  node: Node,
  citationContext = false,
  strings = getExportStrings('en'),
): InlineNode[] {
  if (node.nodeType === node.TEXT_NODE) {
    return splitInferredMath(node.nodeValue ?? '', isStandaloneTextNode(node));
  }
  const view = node.ownerDocument?.defaultView;
  if (!view || !(node instanceof view.Element)) {
    return [];
  }

  const element = node as Element;
  if (isOpaqueLocalReferenceButton(element)) return [];
  if (isExportActionLikeControl(element)) return [];
  if (isExtensionUiElement(element)) return [];
  if (isExcludedFromContent(element) && !isSourceChipElement(element)) return [];
  if (isHiddenFromContent(element)) return [];
  const children = () => parseInlineChildren(element, citationContext, strings);
  if (NON_CONTENT_TAGS.has(tagName(element))) return [];
  const math = mathDescriptor(element);
  if (math) {
    return [{ kind: 'mathInline', ...astMathFields(math) }];
  }

  switch (tagName(element)) {
    case 'BR':
      return [{ kind: 'lineBreak' }];
    case 'STRONG':
    case 'B':
      return [{ kind: 'strong', children: children() }];
    case 'EM':
    case 'I':
      return [{ kind: 'emphasis', children: children() }];
    case 'CODE':
      return [{ kind: 'inlineCode', value: element.textContent ?? '' }];
    case 'IMG':
    case 'SVG': {
      if (isDecorativeCitationInlineAsset(element)) return [];
      const label = element.getAttribute('alt')
        ?? element.getAttribute('aria-label')
        ?? 'image';
      return [{ kind: 'text', value: strings.inlineImageFallback(label) }];
    }
    case 'A': {
      const href = element.getAttribute('href') ?? '';
      if (citationContext) {
        return [{
          kind: 'citation',
          href,
          label: element.textContent?.trim() || href,
          ...(element.getAttribute('title') ? { title: element.getAttribute('title')! } : {}),
        }];
      }
      return [{
        kind: 'link',
        href,
        children: children(),
        ...(isSourceLinkElement(element) ? { presentation: 'source' as const } : {}),
        ...(element.getAttribute('title') ? { title: element.getAttribute('title')! } : {}),
      }];
    }
    default: {
      const parsedChildren = children();
      if (parsedChildren.length > 0 || SUPPORTED_TAGS.has(tagName(element))) {
        return parsedChildren;
      }
      return [{ kind: 'text', value: visibleFallback(element, strings) }];
    }
  }
}

function parseInlineChildren(
  element: Element,
  citationContext = false,
  strings = getExportStrings('en'),
): InlineNode[] {
  const compacted = compactInline(
    [...element.childNodes].flatMap((node) =>
      parseInlineNode(node, citationContext, strings)),
  );
  const onlyChild = compacted[0];
  const standalone = compacted.length === 1
    && onlyChild?.kind === 'text'
    && element.matches('p, li, div')
    && element.textContent?.trim() === onlyChild.value.trim();
  const formatted = inferFormattedInlineMath(compacted, standalone);
  return compactInline(formatted.flatMap((node) =>
    node.kind === 'text'
      ? splitInferredMath(node.value, standalone)
      : [node]));
}

function paragraph(children: InlineNode[]): ParagraphNode | null {
  const compacted = compactInline(children);
  return compacted.length > 0 ? { kind: 'paragraph', children: compacted } : null;
}

function parseTableCell(element: Element, strings: ExportStrings): TableCell {
  const alignment = element.getAttribute('align');
  return {
    children: parseBlocks(element, strings),
    ...(alignment === 'left' || alignment === 'center' || alignment === 'right'
      ? { alignment }
      : {}),
    ...(Number(element.getAttribute('colspan')) > 1
      ? { columnSpan: Number(element.getAttribute('colspan')) }
      : {}),
    ...(Number(element.getAttribute('rowspan')) > 1
      ? { rowSpan: Number(element.getAttribute('rowspan')) }
      : {}),
  };
}

function parseTableRow(element: Element, strings: ExportStrings): TableRow {
  return {
    cells: [...element.children]
      .filter((cell) => cell.matches('th, td'))
      .map((cell) => parseTableCell(cell, strings)),
  };
}

function emptyTableRow(): TableRow {
  return { cells: [] };
}

function parseListItems(element: Element, strings: ExportStrings): ListItem[] {
  return [...element.children]
    .filter((item) => item.tagName === 'LI')
    .map((item) => ({ children: parseBlocks(item, strings) }));
}

function parseImage(element: Element): ImageNode | null {
  if (tagName(element) === 'SVG') {
    const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.outerHTML)}`;
    return {
      kind: 'image',
      source: { kind: 'data-url', value: source },
      alt: element.getAttribute('aria-label') ?? '',
      ...(Number(element.getAttribute('width')) > 0
        ? { width: Number(element.getAttribute('width')) }
        : {}),
      ...(Number(element.getAttribute('height')) > 0
        ? { height: Number(element.getAttribute('height')) }
        : {}),
    };
  }

  const source = element.getAttribute('src')?.trim();
  if (!source) return null;
  return {
    kind: 'image',
    source: { kind: source.startsWith('data:') ? 'data-url' : 'url', value: source },
    alt: element.getAttribute('alt') ?? '',
    ...(source.startsWith('data:') ? {} : { fallbackHref: source }),
    ...(element.getAttribute('title') ? { title: element.getAttribute('title')! } : {}),
    ...(Number(element.getAttribute('width')) > 0
      ? { width: Number(element.getAttribute('width')) }
      : {}),
    ...(Number(element.getAttribute('height')) > 0
      ? { height: Number(element.getAttribute('height')) }
      : {}),
  };
}

function isPreformattedLineElement(element: Element): boolean {
  return element.matches('div, p, [data-line], .line');
}

function preformattedText(element: Element): string {
  const serializeChildren = (parent: Element): string => {
    const children = [...parent.childNodes];
    let output = '';

    children.forEach((child, index) => {
      if (child.nodeType === child.TEXT_NODE) {
        output += child.nodeValue ?? '';
        return;
      }
      const view = child.ownerDocument?.defaultView;
      if (!view || !(child instanceof view.Element)) return;
      const childElement = child as Element;
      if (tagName(childElement) === 'BR') {
        output += '\n';
        return;
      }

      const lineElement = isPreformattedLineElement(childElement);
      if (lineElement && output && !output.endsWith('\n')) output += '\n';
      output += serializeChildren(childElement);
      const hasFollowingContent = children.slice(index + 1).some((sibling) =>
        sibling.nodeType === sibling.TEXT_NODE
          ? Boolean(sibling.nodeValue)
          : true);
      if (lineElement && hasFollowingContent && !output.endsWith('\n')) output += '\n';
    });

    return output;
  };

  return serializeChildren(element).replace(/\r\n?/g, '\n');
}

function preformattedFallbackText(element: Element): string {
  const htmlElement = element as HTMLElement;
  const innerText = typeof htmlElement.innerText === 'string'
    ? htmlElement.innerText
    : '';
  const text = innerText.trim().length > 0
    ? innerText
    : element.textContent ?? '';
  return text.replace(/\r\n?/g, '\n');
}

function preformattedPresentation(
  element: Element,
  value: string,
  language?: string,
): 'code' | 'textFigure' {
  void language;
  if (element.closest('[data-text-figure="true"], [data-presentation="text-figure"], [role="img"]')) {
    return 'textFigure';
  }
  const lines = value.split('\n');
  if (lines.length < 2) return 'code';
  const structuralSymbols = value.match(/[\u2500-\u257f\u2190-\u21ff\u25a0-\u25ff\u2708]/gu)?.length ?? 0;
  const alignedLines = lines.filter((line) => /\t| {2,}/u.test(line)).length;
  const diagramLabels = /\b(?:local overlap|control action|Z_int|R_UA|q\s*=|Spatial layer|Operational layer)\b/iu
    .test(value);
  if (structuralSymbols >= 3 || alignedLines >= 2 || diagramLabels) return 'textFigure';
  return 'code';
}

function normalizeTextFigureMathLabels(value: string): string {
  return value
    .replace(/\\mathcal\{([^{}]+)\}/gu, '$1')
    .replace(/_\{([^{}]+)\}/gu, '_$1')
    .replace(/\^\{([^{}]+)\}/gu, '^$1')
    .replace(/\\alpha\b/gu, 'α')
    .replace(/\\beta\b/gu, 'β')
    .replace(/\\gamma\b/gu, 'γ')
    .replace(/\\theta\b/gu, 'θ');
}

function unavailableImageParagraph(
  element: Element,
  strings: ExportStrings,
): ParagraphNode {
  const alt = element.getAttribute('alt')?.trim();
  return {
    kind: 'paragraph',
    children: [{
      kind: 'text',
      value: strings.imageUnavailable(alt || undefined),
    }],
  };
}

function parseBlockElement(element: Element, strings: ExportStrings): BlockNode[] {
  if (element.hasAttribute('data-page-break')) return [{ kind: 'pageBreak' }];
  const math = mathDescriptor(element);
  if (math?.display === 'block') {
    return [{ kind: 'mathBlock', ...astMathFields(math) }];
  }

  const normalizedTagName = tagName(element);
  if (/^H[1-6]$/.test(normalizedTagName)) {
    return [{
      kind: 'heading',
      level: Number(normalizedTagName.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6,
      children: parseInlineChildren(element, false, strings),
    }];
  }

  switch (normalizedTagName) {
    case 'P': {
      const parsed = paragraph(parseInlineChildren(
        element,
        element.getAttribute('data-citation') === 'true',
        strings,
      ));
      const onlyChild = parsed?.children[0];
      if (
        parsed?.children.length === 1
        && onlyChild?.kind === 'mathInline'
        && element.textContent?.trim() === onlyChild.fallbackText
        && shouldPromoteInferredMathBlock(onlyChild)
      ) {
        return [{
          fallbackText: onlyChild.fallbackText,
          kind: 'mathBlock',
          provenance: onlyChild.provenance,
          source: onlyChild.source,
          sourceFormat: onlyChild.sourceFormat,
        }];
      }
      return parsed ? [parsed] : [];
    }
    case 'BLOCKQUOTE':
      return [{ kind: 'blockquote', children: parseBlocks(element, strings) }];
    case 'OL':
      return [{
        kind: 'orderedList',
        start: Number(element.getAttribute('start')) || 1,
        items: parseListItems(element, strings),
      }];
    case 'UL':
      return [{ kind: 'unorderedList', items: parseListItems(element, strings) }];
    case 'TABLE': {
      const caption = element.querySelector(':scope > caption')?.textContent?.trim();
      const headerElement = element.querySelector(':scope > thead > tr');
      const bodyRows = [...element.querySelectorAll(':scope > tbody > tr')]
        .map((row) => parseTableRow(row, strings));
      const directRows = [...element.querySelectorAll(':scope > tr')]
        .map((row) => parseTableRow(row, strings));
      const table: BlockNode = {
        kind: 'table',
        header: headerElement
          ? parseTableRow(headerElement, strings)
          : directRows.shift() ?? emptyTableRow(),
        rows: bodyRows.length > 0 ? bodyRows : directRows,
      };
      return caption
        ? [{ kind: 'paragraph', children: [{ kind: 'text', value: caption }] }, table]
        : [table];
    }
    case 'PRE': {
      const code = element.querySelector('code');
      const language = [...(code?.classList ?? [])]
        .find((className) => className.startsWith('language-'))
        ?.slice('language-'.length);
      const structuredValue = preformattedText(code ?? element);
      const fallbackValue = preformattedFallbackText(code ?? element);
      const value = structuredValue.trim().length > 0
        ? structuredValue
        : fallbackValue;
      const presentation = preformattedPresentation(element, value, language);
      const normalizedValue = presentation === 'textFigure'
        ? normalizeTextFigureMathLabels(value)
        : value;
      return [{
        kind: 'codeBlock',
        presentation,
        value: normalizedValue,
        ...(language ? { language } : {}),
      }];
    }
    case 'IMG':
    case 'SVG': {
      const image = parseImage(element);
      return image ? [image] : [unavailableImageParagraph(element, strings)];
    }
    case 'HR':
      return [{ kind: 'separator' }];
    default:
      return parseBlocks(element, strings);
  }
}

function isBlockElement(element: Element): boolean {
  return BLOCK_TAGS.has(tagName(element))
    || mathDescriptor(element)?.display === 'block'
    || element.hasAttribute('data-page-break');
}

export function parseBlocks(
  container: Element,
  strings: ExportStrings = getExportStrings('en'),
): BlockNode[] {
  const blocks: BlockNode[] = [];
  let pendingInline: InlineNode[] = [];
  const flushInline = () => {
    const parsed = paragraph(pendingInline);
    if (parsed) blocks.push(parsed);
    pendingInline = [];
  };

  for (const node of container.childNodes) {
    if (node.nodeType === node.TEXT_NODE) {
      pendingInline.push(...parseInlineNode(node, false, strings));
      continue;
    }
    if (!(node instanceof container.ownerDocument.defaultView!.Element)) continue;
    if (isExportActionLikeControl(node)) continue;
    if (isExtensionUiElement(node)) continue;
    if (isExcludedFromContent(node) && !isSourceChipElement(node)) continue;
    if (isHiddenFromContent(node)) continue;

    if (isBlockElement(node)) {
      flushInline();
      blocks.push(...parseBlockElement(node, strings));
    } else {
      pendingInline.push(...parseInlineNode(node, false, strings));
    }
  }
  flushInline();
  return blocks;
}

export function parseMessageContent(
  messageElement: HTMLElement,
  language: ExportLanguage = 'en',
): BlockNode[] {
  return withParserCache(() => {
    const roots = messageContentRoots(messageElement);
    const strings = getExportStrings(language);
    return roots.flatMap((root) => parseBlocks(root, strings));
  });
}

function messageContentRoots(messageElement: HTMLElement): HTMLElement[] {
  if (messageElement.matches(CHATGPT_SELECTORS.messageContent)) return [messageElement];
  const candidates = [
    ...messageElement.querySelectorAll<HTMLElement>(CHATGPT_SELECTORS.messageContent),
  ];
  const roots = candidates.filter((candidate) => !candidates.some((other) =>
    other !== candidate && other.contains(candidate)));
  return roots.length > 0 ? roots : [messageElement];
}

function elementNodePath(root: Element, element: Element): number[] {
  const path: number[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    path.unshift([...parent.children].indexOf(current));
    current = parent;
  }
  return path;
}

export function parseMessageContentResult(
  messageElement: HTMLElement,
  messageId: string,
  language: ExportLanguage = 'en',
): ParsedMessageContent {
  return withParserCache(() => {
    const content = parseMessageContent(messageElement, language);
    const strings = getExportStrings(language);
    const warnings: DocumentWarning[] = [];
    const unsupportedRoots = new Set<Element>();

    const roots = messageContentRoots(messageElement);
    for (const element of roots.flatMap((root) => [...root.querySelectorAll('*')])) {
      if (isOpaqueLocalReferenceButton(element)) {
        unsupportedRoots.add(element);
        continue;
      }
      if (isExportActionLikeControl(element)) {
        unsupportedRoots.add(element);
        continue;
      }
      if (isExtensionUiElement(element)) continue;
      if (isExcludedFromContent(element) && !isSourceChipElement(element)) continue;
      if ([...unsupportedRoots].some((root) => root.contains(element))) continue;
      if (element.closest('svg, math') && !element.matches('svg, math')) continue;

      const normalizedTag = tagName(element);
      const missingImage = normalizedTag === 'IMG' && !element.getAttribute('src')?.trim();
      const nestedInlineImage = (normalizedTag === 'IMG' || normalizedTag === 'SVG')
        && element.closest('p') !== null
        && !isInsideRecognizedMath(element);
      const decorativeCitationInlineAsset = nestedInlineImage
        ? isDecorativeCitationInlineAsset(element)
        : false;
      const unsupported = !SUPPORTED_TAGS.has(normalizedTag)
        && !NON_CONTENT_TAGS.has(normalizedTag)
        && !isSourceChipElement(element);

      if (missingImage) {
        warnings.push({
          code: 'image-unavailable',
          message: strings.missingImageWarning,
          provenance: {
            stage: 'extraction',
            messageId,
            nodePath: elementNodePath(roots.find((root) => root.contains(element))!, element),
            sourceKind: 'image',
          },
        });
      } else if (nestedInlineImage && !decorativeCitationInlineAsset) {
        warnings.push({
          code: 'unsupported-content',
          message: strings.nestedInlineImageWarning,
          provenance: {
            stage: 'extraction',
            messageId,
            nodePath: elementNodePath(roots.find((root) => root.contains(element))!, element),
            sourceKind: 'inline-image',
          },
        });
      }

      if (unsupported) {
        unsupportedRoots.add(element);
        warnings.push({
          code: 'unsupported-content',
          message: strings.unsupportedContentWarning(normalizedTag.toLowerCase()),
          provenance: {
            stage: 'extraction',
            messageId,
            nodePath: elementNodePath(roots.find((root) => root.contains(element))!, element),
            sourceKind: normalizedTag.toLowerCase(),
          },
        });
      }
    }

    return { content, warnings };
  });
}
