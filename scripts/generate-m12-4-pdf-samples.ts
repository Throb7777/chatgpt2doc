import { readFile, mkdir, writeFile } from 'node:fs/promises';
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

const fixturePath = path.resolve('tests/fixtures/chatgpt/m12-semantic-boundaries.html');
const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
  url: 'https://chatgpt.com/c/m12-semantic',
});
const element = dom.window.document.querySelector<HTMLElement>('[data-message-id="m12-semantic"]');
assert(element, 'M12.4 semantic fixture message is missing.');
const parsed = parseMessageContentResult(element, 'm12-semantic');
parsed.content.unshift({
  children: [{ kind: 'text', value: '公式与文字图验证 / Formula and text figure' }],
  kind: 'heading',
  level: 2,
});
const displaySources = [
  '\\frac{a}{b}',
  'x_i^2',
  '\\sqrt[3]{x}',
  '\\sum_{i=1}^{n} i',
  '\\int_0^1 x\\,dx',
  '\\left( a+b \\right)',
  '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}',
  '\\alpha + \\beta \\le \\infty',
  '\\mathcal{T}_m^\\alpha \\rightarrow R_{UA} \\subseteq Z_{int}',
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
  title: 'M12.4 Sanitized PDF Fidelity Fixture',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/m12-semantic',
    capturedAt: '2026-06-28T03:00:00.000Z',
  },
  exportedAt: '2026-06-28T03:01:00.000Z',
  messages: [{
    content: parsed.content,
    id: 'm12-semantic',
    order: 0,
    role: 'assistant',
    selected: true,
    status: 'complete',
  }],
  warnings: parsed.warnings,
};

const outputDir = path.resolve('docs/qa-artifacts/m12-4');
await mkdir(outputDir, { recursive: true });
const reports = [];
for (const paper of ['a4', 'letter'] as const) {
  const request: ExportRequest = {
    document,
    selection: { scope: 'single-response', messageId: 'm12-semantic' },
    options: {
      codeStyle: 'document',
      fileName: `m12-4-pdf-fidelity-${paper}`,
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
  const outputPath = path.join(outputDir, `m12-4-pdf-fidelity-${paper}.pdf`);
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
  const fontResources = loaded.getPages().map((page) => {
    const resources = page.node.Resources();
    if (!resources) return 0;
    return resources.lookupMaybe(PDFName.of('Font'), PDFDict)?.keys().length ?? 0;
  });
  const figurePage = pageTexts.findIndex((value) => value.includes('local overlap'));
  const figureText = figurePage >= 0 ? pageTexts[figurePage] : '';

  assert(
    !text.includes('\u0000') && !text.includes('\uFFFD'),
    `${paper} PDF contains an invalid text character.`,
  );
  assert(compactText.includes('τ∈[0,H]'), `${paper} PDF is missing the tau interval.`);
  assert(compactText.includes('Zint↓q=3'), `${paper} PDF is missing the Z/q expression.`);
  assert(compactText.includes('release/hold/vu(t)'), `${paper} PDF is missing the control expression.`);
  assert(fontResources.every((count) => count <= 16), `${paper} PDF repeats font resources.`);
  assert(figurePage >= 0, `${paper} PDF is missing the text figure.`);
  assert(figureText.includes('┌──── local overlap'), `${paper} PDF split the figure first line.`);
  assert(figureText.includes('│ ● → ■'), `${paper} PDF split the figure symbol line.`);
  assert(figureText.includes('└──── RUA'), `${paper} PDF split the figure final line.`);
  assert(result.warnings.length === 0, `${paper} PDF produced unexpected warnings.`);

  reports.push({
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

const reportPath = path.join(outputDir, 'm12-4-report.json');
await writeFile(reportPath, `${JSON.stringify({ reports }, null, 2)}\n`);
process.stdout.write(await readFile(reportPath, 'utf8'));
