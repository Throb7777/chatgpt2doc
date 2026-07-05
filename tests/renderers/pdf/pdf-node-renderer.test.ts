import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import type { ImageResolver } from '../../../src/assets/image-resolver';
import type { BlockNode, ChatDocument, DocumentWarning } from '../../../src/document/ast';
import type { ExportRequest } from '../../../src/document/export';
import { parseMessageContentResult } from '../../../src/platform/chatgpt/content-parser';
import { nodePdfFontEnvironment } from '../../../scripts/lib/node-pdf-font-environment';
import {
  PDF_SEPARATOR_TOP_GAP,
  PDF_SEPARATOR_TOTAL_HEIGHT,
  renderStructuredPdf,
} from '../../../src/renderers/pdf/pdf-node-renderer';
import type { PdfFontEnvironment } from '../../../src/renderers/pdf/pdf-fonts';

const redPixelPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
));

const fontEnvironment = nodePdfFontEnvironment;

async function fixtureRequest(
  selection: ExportRequest['selection'] = { scope: 'full-conversation' },
): Promise<ExportRequest> {
  const fixturePath = path.resolve(
    'tests/fixtures/reference/synthetic-conversation.html',
  );
  const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
    url: 'https://chatgpt.com/c/synthetic',
  });
  const warnings: DocumentWarning[] = [];
  const messages = Array.from(
    dom.window.document.querySelectorAll<HTMLElement>('[data-message-id]'),
  ).map((element, order) => {
    const id = element.dataset.messageId ?? `message-${order}`;
    const parsed = parseMessageContentResult(element, id);
    warnings.push(...parsed.warnings);
    return {
      content: parsed.content,
      id,
      order,
      role: element.dataset.messageAuthorRole === 'assistant'
        ? 'assistant' as const
        : 'user' as const,
      selected: true,
      status: 'complete' as const,
    };
  });
  const document: ChatDocument = {
    version: 1,
    title: 'M5.2 Structured PDF Fixture',
    source: {
      platform: 'chatgpt',
      url: 'https://chatgpt.com/c/synthetic',
      capturedAt: '2026-06-23T03:00:00.000Z',
    },
    exportedAt: '2026-06-23T03:01:00.000Z',
    messages,
    warnings,
  };
  return {
    document,
    selection,
    options: {
      codeStyle: 'document',
      fileName: 'm5-2-structured',
      format: 'pdf',
      includePrompts: true,
      language: 'en',
      paper: 'a4',
      theme: 'light',
    },
  };
}

async function inspectPdf(blob: Blob): Promise<{
  annotations: Array<{ url?: string }>;
  pageCount: number;
  pageTexts: string[];
  text: string;
}> {
  const pdf = await getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    isEvalSupported: false,
    useWorkerFetch: false,
  }).promise;
  const text: string[] = [];
  const annotations: Array<{ url?: string }> = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    text.push(content.items
      .filter((item): item is typeof item & { str: string } => 'str' in item)
      .map(({ str }) => str)
      .join(''));
    annotations.push(...await page.getAnnotations() as Array<{ url?: string }>);
  }
  return { annotations, pageCount: pdf.numPages, pageTexts: text, text: text.join('\n') };
}

function m14FullDocumentShape(): BlockNode[] {
  const textFigureIndexes = new Set([17, 25, 50, 71, 90, 117, 119]);
  const mathIndexes = new Set([10, 45, 80, 135, 144]);
  return Array.from({ length: 147 }, (_, index): BlockNode => {
    if (index === 140) {
      return {
        children: [{ kind: 'text', value: 'Final recommendation' }],
        kind: 'heading',
        level: 2,
      };
    }
    if (index % 21 === 0) {
      return {
        children: [{
          kind: 'text',
          value: index === 126 ? 'Penultimate compact section' : `Reference-profile section ${index / 21 + 1}`,
        }],
        kind: 'heading',
        level: 2,
      };
    }
    if (textFigureIndexes.has(index)) {
      return {
        kind: 'codeBlock',
        presentation: 'textFigure',
        value: [
          '┌──── local overlap ────┐',
          '│  blue ellipse → q=1  │',
          '│  green box   → q=2  │',
          '│  control action     │',
          '└──── Z_int ↓ q=3 ────┘',
        ].join('\n'),
      };
    }
    if (mathIndexes.has(index)) {
      return {
        fallbackText: 'τ∈[0,H]',
        kind: 'mathBlock',
        provenance: 'inferred',
        source: '\\tau \\in [0,H]',
        sourceFormat: 'tex',
      };
    }
    return {
      children: [{
        kind: 'text',
        value: index % 2 === 0
          ? `Neutral paragraph ${index + 1} keeps export rhythm with marker.`
          : `Neutral paragraph ${index + 1} keeps live-export rhythm with concise evidence and stable pagination.`,
      }],
      kind: 'paragraph',
    };
  });
}

describe('structured PDF renderer', () => {
  it('renders the shared rich-content fixture with links, table, code, and image', async () => {
    const imageResolver: ImageResolver = async () => ({
      data: redPixelPng,
      height: 100,
      status: 'embedded',
      width: 240,
    });
    const result = await renderStructuredPdf(await fixtureRequest(), {
      fontEnvironment,
      imageResolver,
    });
    const inspection = await inspectPdf(result.blob);
    const rawPdf = new TextDecoder('latin1').decode(await result.blob.arrayBuffer());

    expect(inspection.pageCount).toBeGreaterThanOrEqual(2);
    for (const text of [
      'Reference Export Fixture',
      'An English paragraph',
      'Synthetic content only.',
      'First',
      'Nested',
      'Alpha',
      'function identity',
      'Example Domain',
      'Synthetic three-bar chart',
      'P12:',
    ]) {
      expect(inspection.text).toContain(text);
    }
    expect(inspection.annotations.some((annotation) =>
      annotation.url === 'https://example.com/')).toBe(true);
    expect(rawPdf).toContain('/Subtype /Link');
    expect(rawPdf).toContain('/Subtype /Image');
    expect(result.warnings).toEqual(expect.arrayContaining(
      (await fixtureRequest()).document.warnings,
    ));
  });

  it('loads math glyph coverage only when the selected PDF content contains math', async () => {
    const loadedPlain: string[] = [];
    const plainFontEnvironment: PdfFontEnvironment = {
      loadFragment: async (id) => {
        loadedPlain.push(id);
        return fontEnvironment.loadFragment(id);
      },
    };
    const plainRequest = await fixtureRequest();
    plainRequest.document.title = 'Plain PDF';
    plainRequest.document.messages = [{
      content: [{
        children: [{ kind: 'text', value: 'Plain text without formulas.' }],
        kind: 'paragraph',
      }],
      id: 'plain',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];

    await renderStructuredPdf(plainRequest, { fontEnvironment: plainFontEnvironment });

    expect(loadedPlain).not.toContain('math');
    expect(loadedPlain).not.toContain('math-greek');

    const loadedMath: string[] = [];
    const mathFontEnvironment: PdfFontEnvironment = {
      loadFragment: async (id) => {
        loadedMath.push(id);
        return fontEnvironment.loadFragment(id);
      },
    };
    const mathRequest = await fixtureRequest();
    mathRequest.document.title = 'Math PDF';
    mathRequest.document.messages = [{
      content: [{
        fallbackText: 'x',
        kind: 'mathBlock',
        source: 'x',
        sourceFormat: 'tex',
      }],
      id: 'math',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];

    await renderStructuredPdf(mathRequest, { fontEnvironment: mathFontEnvironment });

    expect(loadedMath).toContain('math');
  });

  it('honors assistant-only scope and preserves an image fallback link and warning', async () => {
    const warning: DocumentWarning = {
      code: 'image-unavailable',
      message: 'Synthetic image failure.',
      provenance: {
        messageId: 'fixture-assistant-1',
        sourceKind: 'image',
        stage: 'asset',
      },
    };
    const imageResolver: ImageResolver = async () => ({
      href: 'https://example.com/chart.png',
      status: 'fallback',
      warning,
    });
    const result = await renderStructuredPdf(
      await fixtureRequest({ scope: 'assistant-only' }),
      { fontEnvironment, imageResolver },
    );
    const inspection = await inspectPdf(result.blob);

    expect(inspection.text).not.toContain(
      'Create the deterministic synthetic reference export fixture.',
    );
    expect(inspection.text).toContain('Image unavailable: Synthetic three-bar chart');
    expect(inspection.annotations.some((annotation) =>
      annotation.url === 'https://example.com/chart.png')).toBe(true);
    expect(result.warnings).toContainEqual(warning);
  });

  it('renders compact parenthesized source links without changing ordinary links', async () => {
    const request = await fixtureRequest({
      messageId: 'assistant-source-link',
      scope: 'single-response',
    });
    request.document.messages = [{
      content: [{
        children: [
          { kind: 'text', value: 'Source ' },
          {
            children: [{ kind: 'text', value: '好大夫在线' }],
            href: 'https://www.haodf.com/doctor/155984.html',
            kind: 'link',
            presentation: 'source',
          },
          { kind: 'text', value: ' and ' },
          {
            children: [{ kind: 'text', value: 'ordinary guide' }],
            href: 'https://example.test/guide',
            kind: 'link',
          },
        ],
        kind: 'paragraph',
      }],
      id: 'assistant-source-link',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];

    const result = await renderStructuredPdf(request, { fontEnvironment });
    const inspection = await inspectPdf(result.blob);

    expect(inspection.text).toContain('(好大夫在线)');
    expect(inspection.text).toContain('ordinary guide');
    expect(inspection.text).not.toContain('(ordinary guide)');
    expect(inspection.annotations.some(({ url }) =>
      url === 'https://www.haodf.com/doctor/155984.html')).toBe(true);
    expect(inspection.annotations.some(({ url }) =>
      url === 'https://example.test/guide')).toBe(true);
  });

  it('uses baseline-aware inline math and monospaced PDF code font', async () => {
    const request = await fixtureRequest({
      messageId: 'assistant-inline-math',
      scope: 'single-response',
    });
    request.document.title = 'M10.2 Inline Math and Code Fixture';
    request.document.messages = [{
      content: [
        {
          children: [
            { kind: 'text', value: 'Inline math ' },
            {
              fallbackText: 'E²',
              kind: 'mathInline',
              source: '<math><msup><mi>E</mi><mn>2</mn></msup></math>',
              sourceFormat: 'mathml',
            },
            { kind: 'text', value: ' and code ' },
            { kind: 'inlineCode', value: 'const x = 1;' },
          ],
          kind: 'paragraph',
        },
        {
          kind: 'codeBlock',
          language: 'ts',
          value: 'function add(a, b) {\n  return a + b;\n}',
        },
      ],
      id: 'assistant-inline-math',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];
    const mathDom = new JSDOM();
    const result = await renderStructuredPdf(request, {
      fontEnvironment,
      mathEnvironment: {
        parseMathMl: (source) => (
          new mathDom.window.DOMParser().parseFromString(source, 'application/xml')
        ),
      },
    });
    const inspection = await inspectPdf(result.blob);
    const rawPdf = new TextDecoder('latin1').decode(await result.blob.arrayBuffer());

    expect(inspection.text).toContain('Inline math E');
    expect(inspection.text).toContain('and code const x = 1;');
    expect(inspection.text).toContain('function add');
    expect(inspection.text).not.toContain('<math>');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(rawPdf).toContain('/BaseFont /CascadiaMono');
    expect(rawPdf).toContain('/BaseFont /NotoSerif');
    expect(rawPdf).not.toContain('/BaseFont /Courier');
    expect(rawPdf).not.toContain('/BaseFont /Times-Roman');
    expect(inspection.text).not.toContain('M10.2 Inline Math and Code Fixture');
    expect(inspection.text).not.toContain('Assistant');
  });

  it('bounds page font resources and preserves M12 math and text figures', async () => {
    const fixturePath = path.resolve('tests/fixtures/chatgpt/m12-semantic-boundaries.html');
    const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
      url: 'https://chatgpt.com/c/m12-semantic',
    });
    const assistant = dom.window.document.querySelector<HTMLElement>(
      '[data-message-id="m12-semantic"]',
    )!;
    const parsed = parseMessageContentResult(assistant, 'm12-semantic');
    const request = await fixtureRequest({
      messageId: 'm12-semantic',
      scope: 'single-response',
    });
    request.document.messages = [{
      content: parsed.content,
      id: 'm12-semantic',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];
    request.document.warnings = parsed.warnings;

    const result = await renderStructuredPdf(request, { fontEnvironment });
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const inspection = await inspectPdf(result.blob);
    const loaded = await PDFDocument.load(bytes);
    const fontCounts = loaded.getPages().map((page) => {
      const resources = page.node.Resources();
      if (!resources) return 0;
      const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
      return fonts?.keys().length ?? 0;
    });
    const figurePage = inspection.text.split('\n').find((text) =>
      text.includes('local overlap'));
    const compactFigurePage = figurePage?.replace(/\s+/gu, '');
    const compactMathText = inspection.text.replace(/\s+/gu, '');

    expect(compactMathText).toContain('τ∈[0,H]');
    expect(compactMathText).toContain('Zint↓q=3');
    expect(compactMathText).toContain('release/hold/vu(t)');
    expect(inspection.text).not.toContain('\u0000');
    expect(inspection.text).not.toContain('\uFFFD');
    expect(fontCounts.every((count) => count <= 16)).toBe(true);
    expect(compactFigurePage).toContain('┌────localoverlap');
    expect(compactFigurePage).toContain('│●→■');
    expect(compactFigurePage).toContain('└────R_UA');
    expect(result.warnings).toEqual([]);
  });

  it('renders M13 text-figure labels through math segments without losing symbols', async () => {
    const fixturePath = path.resolve('tests/fixtures/chatgpt/m13-actual-parity-shapes.html');
    const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
      url: 'https://chatgpt.com/c/m13-actual-parity',
    });
    const assistant = dom.window.document.querySelector<HTMLElement>(
      '[data-message-id="m13-actual-parity"]',
    )!;
    const parsed = parseMessageContentResult(assistant, 'm13-actual-parity');
    const request = await fixtureRequest({
      messageId: 'm13-actual-parity',
      scope: 'single-response',
    });
    request.document.messages = [{
      content: parsed.content,
      id: 'm13-actual-parity',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];
    request.document.warnings = parsed.warnings;

    const result = await renderStructuredPdf(request, { fontEnvironment });
    const inspection = await inspectPdf(result.blob);
    const compactText = inspection.text.replace(/\s+/gu, '');

    expect(inspection.text).toContain('蓝色椭圆');
    expect(inspection.text).toContain('绿色矩形');
    expect(inspection.text).toContain('┌───────────┐');
    expect(inspection.text).toContain('control action');
    expect(inspection.text).toContain('→ ‖');
    expect(compactText).toContain('Tmα');
    expect(compactText).toContain('Zint');
    expect(compactText).toContain('RUA');
    expect(compactText).toContain('v_u(t)');
    expect(inspection.text).not.toContain('\u0000');
    expect(inspection.text).not.toContain('\uFFFD');
    expect(result.warnings).toEqual([]);
  });

  it('renders M14 fragmented live shapes into searchable PDF formulas', async () => {
    const fixturePath = path.resolve('tests/fixtures/chatgpt/m14-live-export-shapes.html');
    const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
      url: 'https://chatgpt.com/c/m14-sanitized-shape',
    });
    const assistant = dom.window.document.querySelector<HTMLElement>(
      '[data-message-id="m14-live-export-shapes"]',
    )!;
    const parsed = parseMessageContentResult(assistant, 'm14-live-export-shapes');
    const request = await fixtureRequest({
      messageId: 'm14-live-export-shapes',
      scope: 'single-response',
    });
    request.document.messages = [{
      content: parsed.content,
      id: 'm14-live-export-shapes',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];
    request.document.warnings = parsed.warnings;

    const result = await renderStructuredPdf(request, { fontEnvironment });
    const inspection = await inspectPdf(result.blob);
    const compactText = inspection.text.replace(/\s+/gu, '');

    expect(inspection.pageCount).toBe(1);
    expect(compactText).toContain('τ∈[0,H]');
    expect(compactText).toContain('xu(t)=(cu,su,vu,qu)');
    expect(compactText).toContain('q=1→q=2→q=3→q=4');
    expect(compactText).toContain('Zint=Tmα∩RUA');
    expect(compactText).toContain('Zint');
    expect(compactText).not.toContain('𝒵');
    expect(inspection.text).toContain('local overlap');
    expect(inspection.text).toContain('blue ellipse');
    expect(inspection.text).toContain('green box');
    expect(inspection.text).toContain('control action');
    expect(inspection.text).not.toContain('\u0000');
    expect(inspection.text).not.toContain('\uFFFD');
    expect(result.warnings).toEqual([]);
  });

  it('keeps the final semantic tail together instead of creating an orphan page', async () => {
    const request = await fixtureRequest({
      messageId: 'm14-tail-pagination',
      scope: 'single-response',
    });
    const filler = Array.from({ length: 29 }, (_, index) => ({
      children: [{
        kind: 'text' as const,
        value: `Filler line ${index + 1} before the final formula cluster.`,
      }],
      kind: 'paragraph' as const,
    }));
    const tail = ['Tail keep one', 'Tail keep two', 'Tail keep three'].map((value) => ({
      children: [{ kind: 'text' as const, value }],
      kind: 'paragraph' as const,
    }));
    request.document.messages = [{
      content: [...filler, ...tail],
      id: 'm14-tail-pagination',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];
    request.document.warnings = [];

    const result = await renderStructuredPdf(request, { fontEnvironment });
    const inspection = await inspectPdf(result.blob);
    const lastPageText = inspection.pageTexts.at(-1) ?? '';

    expect(inspection.pageCount).toBeGreaterThanOrEqual(2);
    expect(lastPageText).toContain('Tail keep one');
    expect(lastPageText).toContain('Tail keep two');
    expect(lastPageText).toContain('Tail keep three');
    expect(result.warnings).toEqual([]);
  });

  it('keeps a final headed section together when it fits on one PDF page', async () => {
    const request = await fixtureRequest({
      messageId: 'm14-headed-tail-pagination',
      scope: 'single-response',
    });
    const filler = Array.from({ length: 36 }, (_, index) => ({
      children: [{
        kind: 'text' as const,
        value: `Filler paragraph ${index + 1} before the final headed section.`,
      }],
      kind: 'paragraph' as const,
    }));
    request.document.messages = [{
      content: [
        ...filler,
        {
          children: [{ kind: 'text' as const, value: 'Final recommendation' }],
          kind: 'heading' as const,
          level: 2 as const,
        },
        {
          children: [{ kind: 'text' as const, value: 'Keep this final prose with its heading.' }],
          kind: 'paragraph' as const,
        },
        {
          fallbackText: 'Zint=Tmα∩RUA',
          kind: 'mathBlock' as const,
          provenance: 'inferred' as const,
          source: 'Zint=Tmα∩RUA',
          sourceFormat: 'tex' as const,
        },
        {
          items: [{
            children: [{
              children: [{ kind: 'text' as const, value: 'Tail list item remains with the section.' }],
              kind: 'paragraph' as const,
            }],
          }],
          kind: 'unorderedList' as const,
        },
        { kind: 'separator' as const },
        {
          children: [{ kind: 'text' as const, value: 'Tail closing sentence.' }],
          kind: 'paragraph' as const,
        },
      ],
      id: 'm14-headed-tail-pagination',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];
    request.document.warnings = [];

    const result = await renderStructuredPdf(request, { fontEnvironment });
    const inspection = await inspectPdf(result.blob);
    const lastPageText = inspection.pageTexts.at(-1) ?? '';

    expect(inspection.pageCount).toBeGreaterThanOrEqual(2);
    expect(lastPageText).toContain('Final recommendation');
    expect(lastPageText).toContain('Keep this final prose with its heading.');
    expect(lastPageText).toContain('Tail list item remains with the section.');
    expect(lastPageText).toContain('Tail closing sentence.');
    expect(result.warnings).toEqual([]);
  });

  it('keeps separator rhythm slightly looser without dropping surrounding PDF text', async () => {
    expect(PDF_SEPARATOR_TOP_GAP).toBeLessThanOrEqual(7);
    expect(PDF_SEPARATOR_TOTAL_HEIGHT).toBeGreaterThanOrEqual(30);
    const request = await fixtureRequest({
      messageId: 'm16-separator-rhythm',
      scope: 'single-response',
    });
    request.document.messages = [{
      content: [
        {
          children: [{ kind: 'text' as const, value: 'Section before separator' }],
          kind: 'heading' as const,
          level: 2 as const,
        },
        { kind: 'separator' as const },
        {
          children: [{ kind: 'text' as const, value: 'Paragraph after separator remains searchable.' }],
          kind: 'paragraph' as const,
        },
      ],
      id: 'm16-separator-rhythm',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];
    request.document.warnings = [];

    const result = await renderStructuredPdf(request, { fontEnvironment });
    const inspection = await inspectPdf(result.blob);

    expect(inspection.text).toContain('Section before separator');
    expect(inspection.text).toContain('Paragraph after separator remains searchable.');
    expect(result.warnings).toEqual([]);
  });

  it('keeps a generated full-document final tail from becoming a sparse orphan page', async () => {
    const request = await fixtureRequest({
      messageId: 'm14-full-tail-pagination',
      scope: 'single-response',
    });
    const filler = Array.from({ length: 132 }, (_, index) => ({
      children: [{
        kind: 'text' as const,
        value: `Generated neutral paragraph ${index + 1} with enough content to wrap across the line and mimic the full live export rhythm.`,
      }],
      kind: 'paragraph' as const,
    }));
    request.document.messages = [{
      content: [
        ...filler,
        {
          children: [{ kind: 'text' as const, value: 'Penultimate compact section' }],
          kind: 'heading' as const,
          level: 2 as const,
        },
        {
          children: [{ kind: 'text' as const, value: 'This compact paragraph should rebalance with the final recommendation section.' }],
          kind: 'paragraph' as const,
        },
        {
          children: [{ kind: 'text' as const, value: 'Final recommendation' }],
          kind: 'heading' as const,
          level: 2 as const,
        },
        {
          children: [{ kind: 'text' as const, value: 'Keep final prose and \u03c4\u2208[0,H] together without leaving an almost empty page.' }],
          kind: 'paragraph' as const,
        },
      ],
      id: 'm14-full-tail-pagination',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];
    request.document.warnings = [];

    const result = await renderStructuredPdf(request, { fontEnvironment });
    const inspection = await inspectPdf(result.blob);
    const lastPageText = inspection.pageTexts.at(-1) ?? '';

    expect(inspection.pageCount).toBeGreaterThanOrEqual(5);
    expect(lastPageText).toContain('Penultimate compact section');
    expect(lastPageText).toContain('Final recommendation');
    expect(lastPageText.length).toBeGreaterThan(180);
    expect(result.warnings).toEqual([]);
  });

  it('paginates the 147-block reference-profile shape to eight non-sparse Letter pages', async () => {
    const request = await fixtureRequest({
      messageId: 'm14-reference-profile-pagination',
      scope: 'single-response',
    });
    const content = m14FullDocumentShape();
    request.options.paper = 'letter';
    request.document.messages = [{
      content,
      id: 'm14-reference-profile-pagination',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }];
    request.document.warnings = [];

    const result = await renderStructuredPdf(request, { fontEnvironment });
    const inspection = await inspectPdf(result.blob);
    const lastPageText = inspection.pageTexts.at(-1) ?? '';

    expect(content).toHaveLength(147);
    expect(inspection.pageCount).toBe(8);
    expect(lastPageText).toContain('Final recommendation');
    expect(lastPageText.length).toBeGreaterThan(320);
    expect(result.warnings).toEqual([]);
  });
});
