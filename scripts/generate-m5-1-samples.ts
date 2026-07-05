import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { renderPdfBlob } from '../src/renderers/pdf/pdf-foundation';
import { nodePdfFontEnvironment } from './lib/node-pdf-font-environment';

const outputDir = path.join(process.cwd(), 'docs', 'qa-artifacts', 'm5-1');
await mkdir(outputDir, { recursive: true });

const fontEnvironment = nodePdfFontEnvironment;

const chatDocument: ChatDocument = {
  version: 1,
  title: 'M5.1 Local PDF Foundation 本地验证',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/synthetic-m5-1',
    capturedAt: '2026-06-22T12:00:00.000Z',
  },
  exportedAt: '2026-06-22T12:01:00.000Z',
  messages: [],
  warnings: [],
};

function request(paper: ExportRequest['options']['paper']): ExportRequest {
  return {
    document: chatDocument,
    selection: { scope: 'full-conversation' },
    options: {
      codeStyle: 'document',
      fileName: `m5-1-${paper}`,
      format: 'pdf',
      includePrompts: true,
      language: 'zh-CN',
      paper,
      theme: 'light',
    },
  };
}

const generated = [];
for (const paper of ['a4', 'letter'] as const) {
  const blob = await renderPdfBlob(request(paper), [
    { text: 'Searchable English text and 可搜索的中文文本。' },
    { text: 'Mixed language: browser-local PDF 导出，不上传聊天内容。' },
    { text: `Paper setting: ${paper.toUpperCase()}` },
  ], { fontEnvironment });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const fileName = `m5-1-foundation-${paper}.pdf`;
  await writeFile(path.join(outputDir, fileName), bytes);

  const parsed = await PDFDocument.load(bytes);
  const loadingTask = getDocument({
    data: bytes,
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  const extractedText = textContent.items
    .filter((item): item is typeof item & { str: string } => 'str' in item)
    .map(({ str }) => str)
    .join('');
  const parsedPage = parsed.getPage(0);
  generated.push({
    extractedText,
    fileName,
    height: parsedPage.getHeight(),
    size: blob.size,
    title: parsed.getTitle(),
    width: parsedPage.getWidth(),
  });
}

await writeFile(
  path.join(outputDir, 'inspection.json'),
  `${JSON.stringify(generated, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(generated, null, 2)}\n`);
