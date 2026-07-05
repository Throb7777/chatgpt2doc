import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { JSDOM } from 'jsdom';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { ImageResolver } from '../src/assets/image-resolver';
import type { ChatDocument, DocumentWarning } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { parseMessageContentResult } from '../src/platform/chatgpt/content-parser';
import { renderStructuredPdf } from '../src/renderers/pdf/pdf-node-renderer';
import { nodePdfFontEnvironment } from './lib/node-pdf-font-environment';

const redPixelPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
));
const root = process.cwd();
const outputDir = path.join(root, 'docs', 'qa-artifacts', 'm5-2');
await mkdir(outputDir, { recursive: true });

const dom = new JSDOM(await readFile(path.join(
  root,
  'tests',
  'fixtures',
  'reference',
  'synthetic-conversation.html',
), 'utf8'), {
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
  title: 'M5.2 Structured PDF Content',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/synthetic',
    capturedAt: '2026-06-23T03:00:00.000Z',
  },
  exportedAt: '2026-06-23T03:01:00.000Z',
  messages,
  warnings,
};
const request: ExportRequest = {
  document,
  selection: { scope: 'full-conversation' },
  options: {
    codeStyle: 'document',
    fileName: 'm5-2-structured-content',
    format: 'pdf',
    includePrompts: true,
    language: 'en',
    paper: 'a4',
    theme: 'light',
  },
};
const fontEnvironment = nodePdfFontEnvironment;
const imageResolver: ImageResolver = async () => ({
  data: redPixelPng,
  height: 100,
  status: 'embedded',
  width: 240,
});
const result = await renderStructuredPdf(request, {
  fontEnvironment,
  imageResolver,
});
const bytes = new Uint8Array(await result.blob.arrayBuffer());
const fileName = 'm5-2-structured-content.pdf';
const filePath = path.join(outputDir, fileName);
await writeFile(filePath, bytes);

const pdf = await getDocument({
  data: bytes.slice(),
  isEvalSupported: false,
  useWorkerFetch: false,
}).promise;
const extractedPages: string[] = [];
const links: string[] = [];
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  extractedPages.push(content.items
    .filter((item): item is typeof item & { str: string } => 'str' in item)
    .map(({ str }) => str)
    .join(''));
  links.push(...(await page.getAnnotations())
    .map((annotation) => annotation.url)
    .filter((url): url is string => Boolean(url)));
}
const rawPdf = new TextDecoder('latin1').decode(bytes);
const inspection = {
  extractedPages,
  file: fileName,
  hasImageObject: rawPdf.includes('/Subtype /Image'),
  hasLinkAnnotation: rawPdf.includes('/Subtype /Link'),
  links: [...new Set(links)],
  pageCount: pdf.numPages,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  size: bytes.byteLength,
  warnings: result.warnings,
};
await writeFile(
  path.join(outputDir, 'inspection.json'),
  `${JSON.stringify(inspection, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify({
  file: path.relative(root, filePath),
  image: inspection.hasImageObject,
  links: inspection.links,
  pages: inspection.pageCount,
  size: inspection.size,
  warnings: inspection.warnings.length,
}, null, 2)}\n`);
