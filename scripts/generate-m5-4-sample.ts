import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { ImageResolver } from '../src/assets/image-resolver';
import type { BlockNode, ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { renderStructuredPdf } from '../src/renderers/pdf/pdf-node-renderer';
import { nodePdfFontEnvironment } from './lib/node-pdf-font-environment';

const redPixelPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
));

const fontEnvironment = nodePdfFontEnvironment;

function paragraph(value: string): BlockNode {
  return { children: [{ kind: 'text', value }], kind: 'paragraph' };
}

const filler = Array.from({ length: 30 }, (_, index) => (
  paragraph(`Filler ${String(index + 1).padStart(2, '0')}`)
));
const longCell = Array.from(
  { length: 260 },
  (_, index) => `cell-${String(index + 1).padStart(3, '0')}`,
).join(' ');
const code = Array.from(
  { length: 90 },
  (_, index) => `const line${String(index + 1).padStart(2, '0')} = ${index + 1};`,
).join('\n');
const content: BlockNode[] = [
  { kind: 'pageBreak' },
  ...filler,
  { children: [{ kind: 'text', value: 'Keep Together Heading' }], kind: 'heading', level: 2 },
  paragraph('KEEP_WITH_HEADING_SENTINEL'),
  { kind: 'codeBlock', language: 'ts', value: code },
  {
    header: {
      cells: [
        { children: [paragraph('Key')] },
        { children: [paragraph('Value')] },
      ],
    },
    kind: 'table',
    rows: [{
      cells: [
        { children: [paragraph('Long row')] },
        { children: [paragraph(longCell)] },
      ],
    }],
  },
  { children: [{ kind: 'text', value: 'Tall Image' }], kind: 'heading', level: 2 },
  {
    alt: 'TALL_IMAGE_CAPTION',
    height: 3000,
    kind: 'image',
    source: { kind: 'data-url', value: 'data:image/png;base64,synthetic' },
    width: 1200,
  },
  { children: [{ kind: 'text', value: 'Formula Boundary' }], kind: 'heading', level: 2 },
  {
    fallbackText: 'matrix 1 2 3 4',
    kind: 'mathBlock',
    source: '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}',
    sourceFormat: 'tex',
  },
  paragraph('PAGINATION_END_SENTINEL'),
];
const document: ChatDocument = {
  version: 1,
  title: 'M5.4 Pagination Stress Fixture',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/m5-4-pagination',
    capturedAt: '2026-06-23T05:00:00.000Z',
  },
  exportedAt: '2026-06-23T05:01:00.000Z',
  messages: [{
    content,
    id: 'assistant-pagination',
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
    fileName: 'm5-4-pagination',
    format: 'pdf',
    includePrompts: true,
    language: 'en',
    paper: 'a4',
    theme: 'light',
  },
};
const imageResolver: ImageResolver = async () => ({
  data: redPixelPng,
  height: 3000,
  status: 'embedded',
  width: 1200,
});
const result = await renderStructuredPdf(request, { fontEnvironment, imageResolver });
const bytes = new Uint8Array(await result.blob.arrayBuffer());
const outputDirectory = path.resolve('docs/qa-artifacts/m5-4');
await mkdir(outputDirectory, { recursive: true });
const pdfPath = path.join(outputDirectory, 'm5-4-pagination-stress.pdf');
await writeFile(pdfPath, bytes);

const pdf = await getDocument({
  data: bytes.slice(),
  isEvalSupported: false,
  useWorkerFetch: false,
}).promise;
const pages: Array<{ height: number; text: string; yMax: number; yMin: number }> = [];
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items
    .filter((item): item is typeof item & { str: string; transform: number[] } => (
      'str' in item && 'transform' in item
    ));
  const yValues = items.map((item) => item.transform[5]);
  pages.push({
    height: viewport.height,
    text: items.map(({ str }) => str).join(''),
    yMax: Math.max(...yValues),
    yMin: Math.min(...yValues),
  });
}
const inspection = {
  file: path.basename(pdfPath),
  pageCount: pdf.numPages,
  pages,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  size: bytes.byteLength,
  warnings: result.warnings,
};
await writeFile(
  path.join(outputDirectory, 'inspection.json'),
  `${JSON.stringify(inspection, null, 2)}\n`,
);
console.log(JSON.stringify({
  file: path.relative(process.cwd(), pdfPath),
  pages: inspection.pageCount,
  size: inspection.size,
  warnings: inspection.warnings.length,
}, null, 2));
