import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { parseMessageContentResult } from '../src/platform/chatgpt/content-parser';
import { renderStructuredDocx } from '../src/renderers/docx/docx-node-renderer';
import { renderStructuredPdf } from '../src/renderers/pdf/pdf-node-renderer';
import { nodePdfFontEnvironment } from './lib/node-pdf-font-environment';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fixturePath = path.resolve('tests/fixtures/chatgpt/m15-fresh-export-shapes.html');
const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
  url: 'https://chatgpt.com/c/m15-fresh-export-shapes',
});
const element = dom.window.document.querySelector<HTMLElement>(
  '[data-message-id="m15-fresh-export-shapes"]',
);
assert(element, 'M15.5 fresh-export fixture message is missing.');
const parsed = parseMessageContentResult(element, 'm15-fresh-export-shapes');
const document: ChatDocument = {
  version: 1,
  title: 'M15.5 Fresh Formula Export Fixture',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/m15-fresh-export-shapes',
    capturedAt: '2026-07-01T15:00:00.000Z',
  },
  exportedAt: '2026-07-01T15:01:00.000Z',
  messages: [{
    content: parsed.content,
    id: 'm15-fresh-export-shapes',
    order: 0,
    role: 'assistant',
    selected: true,
    status: 'complete',
  }],
  warnings: parsed.warnings,
};
const baseOptions = {
  codeStyle: 'document' as const,
  includePrompts: true,
  language: 'en' as const,
  paper: 'letter' as const,
  theme: 'light' as const,
};
const selection = { messageId: 'm15-fresh-export-shapes', scope: 'single-response' as const };
const outputDir = path.resolve('docs/qa-artifacts/m15-5');
await mkdir(outputDir, { recursive: true });

const docxRequest: ExportRequest = {
  document,
  selection,
  options: { ...baseOptions, fileName: 'm15-5-fresh-formula', format: 'docx' },
};
const docx = await renderStructuredDocx(docxRequest);
const docxBytes = new Uint8Array(await docx.blob.arrayBuffer());
const archive = await JSZip.loadAsync(docxBytes);
const documentXml = await archive.file('word/document.xml')!.async('string');
const media = Object.keys(archive.files).filter(
  (name) => name.startsWith('word/media/') && !name.endsWith('/'),
);
const mathObjects = documentXml.match(/<m:oMath>/gu)?.length ?? 0;
const subScripts = documentXml.match(/<m:sSub>/gu)?.length ?? 0;
const subSuperScripts = documentXml.match(/<m:sSubSup>/gu)?.length ?? 0;
const delimiters = documentXml.match(/<m:d>/gu)?.length ?? 0;
assert(mathObjects === 3, `Expected 3 editable equations, received ${mathObjects}.`);
assert(subScripts >= 6, `Expected at least 6 subscripts, received ${subScripts}.`);
assert(subSuperScripts >= 4,
  `Expected at least 4 sub/superscripts, received ${subSuperScripts}.`);
assert(delimiters >= 1, 'Expected a structured round delimiter.');
assert(documentXml.includes('⋆'), 'Star action is missing from editable OMML.');
assert(media.length === 0, `Unexpected DOCX fallback media: ${media.join(', ')}.`);
assert(docx.warnings.length === 0, 'Fresh DOCX produced an unexpected warning.');
const docxPath = path.join(outputDir, 'm15-5-fresh-formula.docx');
await writeFile(docxPath, docxBytes);

const pdfRequest: ExportRequest = {
  document,
  selection,
  options: { ...baseOptions, fileName: 'm15-5-fresh-formula', format: 'pdf' },
};
const pdfResult = await renderStructuredPdf(pdfRequest, {
  fontEnvironment: nodePdfFontEnvironment,
});
const pdfBytes = new Uint8Array(await pdfResult.blob.arrayBuffer());
const loadedPdf = await getDocument({
  data: new Uint8Array(pdfBytes),
  isEvalSupported: false,
  useWorkerFetch: false,
}).promise;
const pageTexts: string[] = [];
for (let pageNumber = 1; pageNumber <= loadedPdf.numPages; pageNumber += 1) {
  const page = await loadedPdf.getPage(pageNumber);
  const content = await page.getTextContent();
  pageTexts.push(content.items
    .filter((item): item is typeof item & { str: string } => 'str' in item)
    .map(({ str }) => str)
    .join(''));
}
const pdfText = pageTexts.join('\n');
assert(loadedPdf.numPages === 1, `Fresh PDF spans ${loadedPdf.numPages} pages.`);
assert(!pdfText.includes('\u0000') && !pdfText.includes('\uFFFD'),
  'Fresh PDF contains an invalid text character.');
for (const value of ['p', 'β', '∣', '⊙', '⋆', 'x', '5']) {
  assert(pdfText.includes(value), `Fresh PDF is missing formula text: ${value}.`);
}
assert(pdfResult.warnings.length === 0, 'Fresh PDF produced an unexpected warning.');
const pdfPath = path.join(outputDir, 'm15-5-fresh-formula.pdf');
await writeFile(pdfPath, pdfBytes);

const reportPath = path.join(outputDir, 'm15-5-report.json');
await writeFile(reportPath, `${JSON.stringify({
  docx: {
    delimiters,
    file: path.relative(process.cwd(), docxPath),
    mathObjects,
    media,
    size: docx.blob.size,
    subScripts,
    subSuperScripts,
    warningCodes: docx.warnings.map(({ code }) => code),
  },
  pdf: {
    file: path.relative(process.cwd(), pdfPath),
    invalidTextCharacters: 0,
    pages: loadedPdf.numPages,
    size: pdfResult.blob.size,
    warningCodes: pdfResult.warnings.map(({ code }) => code),
  },
}, null, 2)}\n`);
process.stdout.write(await readFile(reportPath, 'utf8'));
