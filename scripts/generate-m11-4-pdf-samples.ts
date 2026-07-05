import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { parseMessageContentResult } from '../src/platform/chatgpt/content-parser';
import { renderStructuredPdf } from '../src/renderers/pdf/pdf-node-renderer';
import { nodePdfFontEnvironment } from './lib/node-pdf-font-environment';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function inspectPdf(blob: Blob): Promise<{
  pages: number;
  text: string;
  textItems: number;
}> {
  const pdf = await getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    isEvalSupported: false,
    useWorkerFetch: false,
  }).promise;
  const pages: string[] = [];
  let textItems = 0;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    textItems += content.items.length;
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(''));
  }
  return { pages: pdf.numPages, text: pages.join('\n'), textItems };
}

const fixture = await readFile(
  path.resolve('tests/fixtures/chatgpt/m11-real-world-reduced.html'),
  'utf8',
);
const dom = new JSDOM(fixture, { url: 'https://chatgpt.com/c/m11-reduced' });
const element = dom.window.document.querySelector<HTMLElement>('[data-message-id="m11-reduced"]');
assert(element, 'M11.4 reduced fixture message is missing.');
const parsed = parseMessageContentResult(element, 'm11-reduced');
parsed.content.push({
  fallbackText: 'script T sub m sup alpha to R sub UA subset Z sub int',
  kind: 'mathBlock',
  source: '\\mathcal{T}_m^\\alpha \\rightarrow R_{UA} \\subseteq Z_{int}',
  sourceFormat: 'tex',
});

const document: ChatDocument = {
  version: 1,
  title: 'M11.4 Internal Fixture Title',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/m11-reduced',
    capturedAt: '2026-06-27T09:00:00.000Z',
  },
  exportedAt: '2026-06-27T09:01:00.000Z',
  messages: [{
    content: parsed.content,
    id: 'm11-reduced',
    order: 0,
    role: 'assistant',
    selected: true,
    status: 'complete',
  }],
  warnings: parsed.warnings,
};

const outputDir = path.resolve('docs/qa-artifacts/m11-4');
await mkdir(outputDir, { recursive: true });
const reports = [];
for (const paper of ['a4', 'letter'] as const) {
  const request: ExportRequest = {
    document,
    selection: { scope: 'single-response', messageId: 'm11-reduced' },
    options: {
      codeStyle: 'document',
      fileName: `m11-4-real-world-${paper}`,
      format: 'pdf',
      includePrompts: true,
      language: 'en',
      paper,
      theme: 'light',
    },
  };
  const result = await renderStructuredPdf(request, {
    fontEnvironment: nodePdfFontEnvironment,
    mathEnvironment: {
      parseMathMl: (source) => new dom.window.DOMParser().parseFromString(source, 'application/xml'),
    },
  });
  const inspection = await inspectPdf(result.blob);
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const raw = new TextDecoder('latin1').decode(bytes);
  const file = path.join(outputDir, `m11-4-real-world-${paper}.pdf`);

  for (const text of ['Show ', 'aircraft', 'point', 'tab:', 'tail.', '𝒯', '→', '⊆']) {
    assert(inspection.text.includes(text), `${paper} PDF is missing searchable text: ${text}`);
  }
  assert(!inspection.text.includes('draft'), `${paper} PDF leaked draft state.`);
  assert(!inspection.text.includes('Assistant'), `${paper} PDF leaked role chrome.`);
  assert(!inspection.text.includes('M11.4 Internal Fixture Title'), `${paper} PDF leaked title chrome.`);
  const invalidCharacters = [...inspection.text].flatMap((character, index) => (
    character === String.fromCharCode(0) || character === '\uFFFD'
      ? [{
          codePoint: `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`,
          context: inspection.text.slice(Math.max(0, index - 12), index + 13),
          index,
        }]
      : []
  ));
  assert(
    invalidCharacters.length === 0,
    `${paper} PDF text layer contains invalid characters: ${JSON.stringify(invalidCharacters)}`,
  );
  assert(result.warnings.every(({ code }) => code !== 'math-fallback'), `${paper} PDF used math fallback.`);
  assert(raw.includes('/BaseFont /NotoSerif'), `${paper} PDF is missing the embedded serif role.`);
  assert(raw.includes('/BaseFont /NotoSansMono'), `${paper} PDF is missing the embedded mono role.`);
  assert(!raw.includes('/BaseFont /Times-'), `${paper} PDF leaked a standard Times font.`);
  assert(!raw.includes('/BaseFont /Courier'), `${paper} PDF leaked a standard Courier font.`);
  assert(raw.includes('/FontFile2'), `${paper} PDF is missing embedded local fonts.`);
  await writeFile(file, bytes);
  reports.push({
    bytes: bytes.length,
    file: path.relative(process.cwd(), file),
    pages: inspection.pages,
    paper,
    textItems: inspection.textItems,
    warningCodes: result.warnings.map(({ code }) => code),
  });
}

const reportPath = path.join(outputDir, 'm11-4-report.json');
await writeFile(reportPath, `${JSON.stringify({ reports }, null, 2)}\n`);
process.stdout.write(await readFile(reportPath, 'utf8'));
