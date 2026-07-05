import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { JSDOM } from 'jsdom';

import type { ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { parseMessageContentResult } from '../src/platform/chatgpt/content-parser';
import { renderStructuredDocxBlob } from '../src/renderers/docx/docx-node-renderer';

const root = process.cwd();
const fixturePath = path.join(
  root,
  'tests',
  'fixtures',
  'reference',
  'synthetic-conversation.html',
);
const outputPath = path.join(
  root,
  'docs',
  'qa-artifacts',
  'm4-2',
  'm4-2-structured-content.docx',
);
await mkdir(path.dirname(outputPath), { recursive: true });
const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
  url: 'https://chatgpt.com/c/synthetic',
});
const articles = [
  ...dom.window.document.querySelectorAll<HTMLElement>('[data-message-id]'),
];
const warnings: ChatDocument['warnings'] = [];
const messages = articles.map((element, order) => {
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
    selected: false,
    status: 'complete' as const,
  };
});
const document: ChatDocument = {
  version: 1,
  title: 'M4.2 Structured Content 验证',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/synthetic',
    capturedAt: '2026-06-22T07:00:00.000Z',
  },
  exportedAt: '2026-06-22T07:01:00.000Z',
  messages,
  warnings,
};
const request: ExportRequest = {
  document,
  selection: { scope: 'full-conversation' },
  options: {
    codeStyle: 'document',
    fileName: 'm4-2-structured-content',
    format: 'docx',
    includePrompts: true,
    language: 'zh-CN',
    paper: 'a4',
    theme: 'light',
  },
};
const blob = await renderStructuredDocxBlob(request);
await writeFile(outputPath, new Uint8Array(await blob.arrayBuffer()));
process.stdout.write(`${JSON.stringify({
  file: path.relative(root, outputPath),
  messages: messages.length,
  size: blob.size,
  warnings: warnings.length,
}, null, 2)}\n`);
