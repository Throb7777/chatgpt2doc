import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { BlockNode, ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { renderStructuredPdf } from '../src/renderers/pdf/pdf-node-renderer';
import { nodePdfFontEnvironment } from './lib/node-pdf-font-environment';

const fontEnvironment = nodePdfFontEnvironment;

function mathBlock(
  label: string,
  source: string,
  sourceFormat: 'mathml' | 'tex' = 'tex',
  fallbackText = source,
): BlockNode[] {
  return [
    { children: [{ kind: 'text', value: label }], kind: 'heading', level: 3 },
    { fallbackText, kind: 'mathBlock', source, sourceFormat },
  ];
}

const content: BlockNode[] = [
  ...mathBlock('Fraction', '\\frac{a+b}{c+d}'),
  ...mathBlock('Scripts', 'x_i^2 + y_{n+1}'),
  ...mathBlock('Indexed radical', '\\sqrt[3]{x+1}'),
  ...mathBlock('Summation', '\\sum_{i=1}^{n} i'),
  ...mathBlock('Integral', '\\int_0^1 x\\,dx'),
  ...mathBlock('Delimiters', '\\left( a+b \\right)'),
  ...mathBlock('Matrix', '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}'),
  ...mathBlock('Symbols', '\\alpha + \\beta \\le \\infty'),
  ...mathBlock(
    'MathML fraction',
    '<math><mfrac><mi>c</mi><mi>d</mi></mfrac></math>',
    'mathml',
    'c/d',
  ),
  ...mathBlock(
    'Explicit fallback',
    '\\color{red}{x}',
    'tex',
    'Unsupported color expression: x',
  ),
];

const document: ChatDocument = {
  version: 1,
  title: 'M5.3 Vector Mathematical Expressions',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/m5-3-synthetic',
    capturedAt: '2026-06-23T04:00:00.000Z',
  },
  exportedAt: '2026-06-23T04:01:00.000Z',
  messages: [{
    content,
    id: 'assistant-math',
    order: 0,
    role: 'assistant',
    selected: true,
    status: 'complete',
  }],
  warnings: [],
};

const request: ExportRequest = {
  document,
  selection: { scope: 'full-conversation' },
  options: {
    codeStyle: 'document',
    fileName: 'm5-3-vector-math',
    format: 'pdf',
    includePrompts: true,
    language: 'en',
    paper: 'a4',
    theme: 'light',
  },
};

const dom = new JSDOM();
const result = await renderStructuredPdf(request, {
  fontEnvironment,
  mathEnvironment: {
    parseMathMl: (source) => (
      new dom.window.DOMParser().parseFromString(source, 'application/xml')
    ),
  },
});
const bytes = new Uint8Array(await result.blob.arrayBuffer());
const outputDirectory = path.resolve('docs/qa-artifacts/m5-3');
await mkdir(outputDirectory, { recursive: true });
const pdfPath = path.join(outputDirectory, 'm5-3-vector-math.pdf');
await writeFile(pdfPath, bytes);

const pdf = await getDocument({
  data: bytes.slice(),
  isEvalSupported: false,
  useWorkerFetch: false,
}).promise;
const pages: string[] = [];
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
  const page = await pdf.getPage(pageNumber);
  const text = await page.getTextContent();
  pages.push(text.items
    .filter((item): item is typeof item & { str: string } => 'str' in item)
    .map(({ str }) => str)
    .join(''));
}
const inspection = {
  extractedPages: pages,
  file: path.basename(pdfPath),
  fallbackWarnings: result.warnings.filter(({ code }) => code === 'math-fallback'),
  pageCount: pdf.numPages,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  size: bytes.byteLength,
};
await writeFile(
  path.join(outputDirectory, 'inspection.json'),
  `${JSON.stringify(inspection, null, 2)}\n`,
);

console.log(JSON.stringify({
  file: path.relative(process.cwd(), pdfPath),
  fallbackWarnings: inspection.fallbackWarnings.length,
  pages: inspection.pageCount,
  size: inspection.size,
}, null, 2));
