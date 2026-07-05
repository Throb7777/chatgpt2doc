import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';

import type { ChatDocument, DocumentWarning } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { parseMessageContentResult } from '../src/platform/chatgpt/content-parser';
import { renderStructuredDocx } from '../src/renderers/docx/docx-node-renderer';
import { renderStructuredPdf } from '../src/renderers/pdf/pdf-node-renderer';
import { nodePdfFontEnvironment } from './lib/node-pdf-font-environment';

const fixtureHtml = [
  '<article data-message-id="assistant-m10-2" data-message-author-role="assistant">',
  '<h2>M10.2 export fidelity fixture</h2>',
  '<p>English and 中文 inline formula ',
  '<span class="katex">',
  '<span class="katex-mathml">',
  '<math><semantics>',
  '<msup><mi>E</mi><mn>2</mn></msup>',
  '<annotation encoding="application/x-tex">E^2</annotation>',
  '</semantics></math>',
  '</span>',
  '<span class="katex-html" aria-hidden="true">hidden duplicate E2</span>',
  '</span>',
  ' with inline code <code>const answer = 42;</code>.</p>',
  '<pre><code class="language-ts">function add(a, b) {\n  return a + b;\n}</code></pre>',
  '<div class="katex-display">',
  '<span class="katex">',
  '<span class="katex-mathml">',
  '<math><semantics>',
  '<mfrac><mi>a</mi><mi>b</mi></mfrac>',
  '<annotation encoding="application/x-tex">\\frac{a}{b}</annotation>',
  '</semantics></math>',
  '</span>',
  '<span class="katex-html" aria-hidden="true">hidden duplicate a/b</span>',
  '</span>',
  '</div>',
  '<div data-math-display="block" data-math-source="\\color{red}{x}" ',
  'data-math-fallback="Unsupported color expression: x"></div>',
  '</article>',
].join('');

const fontEnvironment = nodePdfFontEnvironment;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function request(): ExportRequest {
  const dom = new JSDOM(fixtureHtml, { url: 'https://chatgpt.com/c/m10-2' });
  const element = dom.window.document.querySelector<HTMLElement>('article');
  assert(element, 'M10.2 fixture article is missing.');
  const parsed = parseMessageContentResult(element, 'assistant-m10-2');
  const document: ChatDocument = {
    exportedAt: '2026-06-26T10:00:00.000Z',
    messages: [{
      content: parsed.content,
      id: 'assistant-m10-2',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }],
    source: {
      capturedAt: '2026-06-26T09:59:00.000Z',
      platform: 'chatgpt',
      url: 'https://chatgpt.com/c/m10-2',
    },
    title: 'M10.2 Export Fidelity Fixture',
    version: 1,
    warnings: parsed.warnings,
  };
  return {
    document,
    options: {
      codeStyle: 'document',
      fileName: 'm10-2-export-fidelity',
      format: 'pdf',
      includePrompts: true,
      language: 'en',
      paper: 'a4',
      theme: 'light',
    },
    selection: { scope: 'full-conversation' },
  };
}

async function pdfText(blob: Blob): Promise<{ pageCount: number; text: string }> {
  const pdf = await getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    isEvalSupported: false,
    useWorkerFetch: false,
  }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items
      .filter((item): item is typeof item & { str: string } => 'str' in item)
      .map(({ str }) => str)
      .join(''));
  }
  return { pageCount: pdf.numPages, text: pages.join('\n') };
}

async function docxXml(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')?.async('text');
  assert(xml, 'word/document.xml is missing from DOCX.');
  return xml;
}

const baseRequest = request();
const docxRequest: ExportRequest = {
  ...baseRequest,
  options: { ...baseRequest.options, format: 'docx' },
};
const pdfRequest: ExportRequest = {
  ...baseRequest,
  options: { ...baseRequest.options, format: 'pdf' },
};

const docx = await renderStructuredDocx(docxRequest);
const pdf = await renderStructuredPdf(pdfRequest, { fontEnvironment });

const pdfInspection = await pdfText(pdf.blob);
const documentXml = await docxXml(docx.blob);
const pdfBytes = new Uint8Array(await pdf.blob.arrayBuffer());
const docxBytes = new Uint8Array(await docx.blob.arrayBuffer());
const rawPdf = new TextDecoder('latin1').decode(pdfBytes);

assert(pdfInspection.text.includes('English and 中文 inline formula E2'), (
  `PDF did not preserve mixed-language inline math text: ${JSON.stringify(pdfInspection.text)}`
));
assert(pdfInspection.text.includes('function add'), 'PDF did not preserve the code block.');
assert(!pdfInspection.text.includes('hidden duplicate'), 'Hidden math rendering leaked into PDF text.');
assert(!pdfInspection.text.includes('<math>'), 'Raw MathML leaked into PDF text.');
assert(rawPdf.includes('/BaseFont /NotoSansMono'), 'PDF code did not use the embedded mono font.');
assert(documentXml.includes('<m:oMath'), 'DOCX did not contain editable OMML math.');
assert(documentXml.includes('ChatExportCode'), 'DOCX did not preserve the code block style.');
assert(documentXml.includes('F3F4F6'), 'DOCX did not preserve inline code shading.');

const docxMathWarnings = docx.warnings.filter(({ code }) => code === 'math-fallback');
const pdfMathWarnings = pdf.warnings.filter(({ code }) => code === 'math-fallback');
assert(docxMathWarnings.length === 1, 'DOCX unsupported math warning count is incorrect.');
assert(pdfMathWarnings.length === 1, 'PDF unsupported math warning count is incorrect.');

const outputDirectory = path.resolve('docs/qa-artifacts/m10-2');
await mkdir(outputDirectory, { recursive: true });
const docxPath = path.join(outputDirectory, 'm10-2-export-fidelity.docx');
const pdfPath = path.join(outputDirectory, 'm10-2-export-fidelity.pdf');
await writeFile(docxPath, docxBytes);
await writeFile(pdfPath, pdfBytes);

const inspection = {
  docx: {
    file: path.basename(docxPath),
    mathFallbackWarnings: docxMathWarnings as DocumentWarning[],
    sha256: createHash('sha256').update(docxBytes).digest('hex'),
    size: docxBytes.byteLength,
  },
  pdf: {
    extractedText: pdfInspection.text,
    file: path.basename(pdfPath),
    mathFallbackWarnings: pdfMathWarnings as DocumentWarning[],
    pageCount: pdfInspection.pageCount,
    sha256: createHash('sha256').update(pdfBytes).digest('hex'),
    size: pdfBytes.byteLength,
  },
};
await writeFile(
  path.join(outputDirectory, 'inspection.json'),
  `${JSON.stringify(inspection, null, 2)}\n`,
);

console.log(JSON.stringify({
  docx: path.relative(process.cwd(), docxPath),
  docxMathFallbackWarnings: docxMathWarnings.length,
  pdf: path.relative(process.cwd(), pdfPath),
  pdfMathFallbackWarnings: pdfMathWarnings.length,
  pdfPages: pdfInspection.pageCount,
}, null, 2));
