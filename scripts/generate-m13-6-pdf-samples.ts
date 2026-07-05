import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';

import type { BlockNode, ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { parseMessageContentResult } from '../src/platform/chatgpt/content-parser';
import { renderStructuredPdf } from '../src/renderers/pdf/pdf-node-renderer';
import { nodePdfFontEnvironment } from './lib/node-pdf-font-environment';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fixturePath = path.resolve('tests/fixtures/chatgpt/m13-actual-parity-shapes.html');
const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
  url: 'https://chatgpt.com/c/m13-actual-parity',
});
const element = dom.window.document.querySelector<HTMLElement>(
  '[data-message-id="m13-actual-parity"]',
);
assert(element, 'M13.6 actual-shape fixture message is missing.');
const parsed = parseMessageContentResult(element, 'm13-actual-parity');
parsed.content.unshift({
  children: [{ kind: 'text', value: '公式与文字图验证 / Formula and text-figure parity' }],
  kind: 'heading',
  level: 2,
});
const displaySources = [
  '\\frac{a}{b}',
  'x_i^2',
  '\\sqrt[3]{x}',
  '\\sum_{i=1}^{n} i',
  '\\int_0^1 x\\,dx',
  '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}',
  'q_u(t)\\in\\{1,2,3,4\\}',
];
const displayBlocks: BlockNode[] = displaySources.map((source) => ({
  fallbackText: source,
  kind: 'mathBlock',
  provenance: 'explicit',
  source,
  sourceFormat: 'tex',
}));
parsed.content.push(...displayBlocks);

const document: ChatDocument = {
  version: 1,
  title: 'M13.6 Sanitized Actual-Shape PDF Fixture',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/m13-actual-parity',
    capturedAt: '2026-06-29T07:30:00.000Z',
  },
  exportedAt: '2026-06-29T07:31:00.000Z',
  messages: [{
    content: parsed.content,
    id: 'm13-actual-parity',
    order: 0,
    role: 'assistant',
    selected: true,
    status: 'complete',
  }],
  warnings: parsed.warnings,
};

const outputDir = path.resolve('docs/qa-artifacts/m13-6');
await mkdir(outputDir, { recursive: true });
const reports = [];
for (const paper of ['a4', 'letter'] as const) {
  const request: ExportRequest = {
    document,
    selection: { scope: 'single-response', messageId: 'm13-actual-parity' },
    options: {
      codeStyle: 'document',
      fileName: `m13-6-pdf-parity-${paper}`,
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
  const outputPath = path.join(outputDir, `m13-6-pdf-parity-${paper}.pdf`);
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
  const figurePage = pageTexts.findIndex((value) => value.includes('local overlap'));
  const figureText = figurePage >= 0 ? pageTexts[figurePage] : '';

  assert(pdf.numPages === 1, `${paper} PDF unexpectedly spans ${pdf.numPages} pages.`);
  assert(!text.includes('\u0000') && !text.includes('\uFFFD'),
    `${paper} PDF contains an invalid text character.`);
  assert(compactText.includes('τ∈[0,H]'), `${paper} PDF is missing the tau interval.`);
  assert(compactText.includes('Zint=Tmα∩RUA'), `${paper} PDF is missing the inset relation.`);
  assert(compactText.includes('Zint↓q=3'), `${paper} PDF is missing the compact display relation.`);
  assert(compactText.includes('𝒵int'), `${paper} PDF is missing the explicit calligraphic source.`);
  assert(figurePage >= 0, `${paper} PDF is missing the text figure.`);
  for (const value of ['蓝色椭圆', '绿色矩形', '┌───────────┐', 'control action']) {
    assert(figureText.includes(value), `${paper} PDF is missing text-figure content: ${value}`);
  }
  for (const value of ['Tmα', 'Zint', 'RUA', '→‖vu(t)']) {
    assert(compactText.includes(value), `${paper} PDF is missing shaped/symbol content: ${value}`);
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
    textFigurePage: figurePage + 1,
    textItems,
    warningCodes: result.warnings.map(({ code }) => code),
  });
}

const reportPath = path.join(outputDir, 'm13-6-report.json');
await writeFile(reportPath, `${JSON.stringify({ reports }, null, 2)}\n`);
process.stdout.write(await readFile(reportPath, 'utf8'));
