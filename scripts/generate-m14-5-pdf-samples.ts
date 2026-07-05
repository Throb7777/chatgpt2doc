import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';

import type { ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { parseMessageContentResult } from '../src/platform/chatgpt/content-parser';
import { renderStructuredPdf } from '../src/renderers/pdf/pdf-node-renderer';
import { nodePdfFontEnvironment } from './lib/node-pdf-font-environment';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fixturePath = path.resolve('tests/fixtures/chatgpt/m14-live-export-shapes.html');
const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
  url: 'https://chatgpt.com/c/m14-sanitized-shape',
});
const element = dom.window.document.querySelector<HTMLElement>(
  '[data-message-id="m14-live-export-shapes"]',
);
assert(element, 'M14.5 live-export-shape fixture message is missing.');
const parsed = parseMessageContentResult(element, 'm14-live-export-shapes');
parsed.content.unshift({
  children: [{ kind: 'text', value: 'Live-shape PDF acceptance' }],
  kind: 'heading',
  level: 2,
});
parsed.content.push({
  items: [
    { children: [{ children: [{ kind: 'text', value: 'Formula semantics preserved' }], kind: 'paragraph' }] },
    { children: [{ children: [{ kind: 'text', value: 'Text-figure grid preserved' }], kind: 'paragraph' }] },
  ],
  kind: 'unorderedList',
});

const document: ChatDocument = {
  version: 1,
  title: 'M14.5 Sanitized Live-Shape PDF Fixture',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/m14-sanitized-shape',
    capturedAt: '2026-06-29T14:20:00.000Z',
  },
  exportedAt: '2026-06-29T14:21:00.000Z',
  messages: [{
    content: parsed.content,
    id: 'm14-live-export-shapes',
    order: 0,
    role: 'assistant',
    selected: true,
    status: 'complete',
  }],
  warnings: parsed.warnings,
};

const outputDir = path.resolve('docs/qa-artifacts/m14-5');
await mkdir(outputDir, { recursive: true });
const reports = [];
for (const paper of ['a4', 'letter'] as const) {
  const request: ExportRequest = {
    document,
    selection: { scope: 'single-response', messageId: 'm14-live-export-shapes' },
    options: {
      codeStyle: 'document',
      fileName: `m14-5-pdf-live-shape-${paper}`,
      format: 'pdf',
      includePrompts: true,
      language: 'en',
      paper,
      theme: 'light',
    },
  };
  const result = await renderStructuredPdf(request, {
    fontEnvironment: nodePdfFontEnvironment,
  });
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const outputPath = path.join(outputDir, `m14-5-pdf-live-shape-${paper}.pdf`);
  await writeFile(outputPath, bytes);
  const loaded = await PDFDocument.load(bytes.slice());
  const pdf = await getDocument({
    data: bytes,
    isEvalSupported: false,
    useWorkerFetch: false,
  }).promise;
  const pageTexts: string[] = [];
  const textItems: number[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.filter(
      (item): item is typeof item & { str: string } => 'str' in item,
    );
    pageTexts.push(items.map(({ str }) => str).join(''));
    textItems.push(items.length);
  }
  const text = pageTexts.join('\n');
  const compactText = text.replace(/\s+/gu, '');
  const baseFonts = new Set<string>();
  const fontResources = loaded.getPages().map((page) => {
    const resources = page.node.Resources();
    if (!resources) return 0;
    const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
    for (const name of fonts?.keys() ?? []) {
      const font = fonts?.lookupMaybe(name, PDFDict);
      const baseFont = font?.get(PDFName.of('BaseFont'));
      if (baseFont instanceof PDFName) baseFonts.add(baseFont.toString());
    }
    return fonts?.keys().length ?? 0;
  });
  const figurePages = pageTexts
    .map((value, index) => ({ index, value }))
    .filter(({ value }) => value.includes('local overlap') || value.includes('control action'));
  const figureText = figurePages.map(({ value }) => value).join('\n');

  assert(pdf.numPages === 1, `${paper} PDF unexpectedly spans ${pdf.numPages} pages.`);
  assert(!text.includes('\u0000') && !text.includes('\uFFFD'),
    `${paper} PDF contains an invalid text character.`);
  for (const value of [
    'τ∈[0,H]',
    'xu(t)=(cu,su,vu,qu)',
    'q=1→q=2→q=3→q=4',
    'Zint=Tmα∩RUA',
    'Zint',
  ]) {
    assert(compactText.includes(value), `${paper} PDF is missing formula text: ${value}`);
  }
  assert(!compactText.includes('𝒵'), `${paper} PDF still contains an ornamental math identifier.`);
  for (const value of ['local overlap', 'blue ellipse', 'green box', 'control action']) {
    assert(figureText.includes(value), `${paper} PDF is missing text-figure content: ${value}`);
  }
  assert(fontResources.every((count) => count <= 16),
    `${paper} PDF repeats page font resources: ${fontResources.join(', ')}.`);
  assert(baseFonts.size <= 16, `${paper} PDF embeds ${baseFonts.size} unique base fonts.`);
  assert(textItems.every((count) => count <= 260),
    `${paper} PDF has excessive text fragmentation: ${textItems.join(', ')}.`);
  assert(result.warnings.length === 0, `${paper} PDF produced unexpected warnings.`);

  reports.push({
    baseFonts: [...baseFonts].sort(),
    file: path.relative(process.cwd(), outputPath),
    fontResources,
    invalidTextCharacters: 0,
    pages: pdf.numPages,
    paper,
    size: result.blob.size,
    textFigurePages: figurePages.map(({ index }) => index + 1),
    textItems,
    warningCodes: result.warnings.map(({ code }) => code),
  });
}

const reportPath = path.join(outputDir, 'm14-5-report.json');
await writeFile(reportPath, `${JSON.stringify({ reports }, null, 2)}\n`);
process.stdout.write(await readFile(reportPath, 'utf8'));
