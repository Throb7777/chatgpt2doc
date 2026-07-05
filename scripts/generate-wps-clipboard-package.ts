import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { JSDOM } from 'jsdom';

import type { ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { parseMessageContentResult } from '../src/platform/chatgpt/content-parser';
import { renderStructuredDocxBlob } from '../src/renderers/docx/docx-node-renderer';

const root = process.cwd();
const outputPath = path.resolve(
  process.argv[2]
    ?? path.join(
      root,
      'docs',
      'qa-artifacts',
      'm16-1',
      'wps-native-equation-copy',
      '20260703',
      'project-generated-package.docx',
    ),
);
const fixturePath = path.join(root, 'tests', 'fixtures', 'clipboard', 'word-math-corpus.html');
const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
  url: 'https://chatgpt.com/c/wps-clipboard-fixture',
});
const article = dom.window.document.querySelector<HTMLElement>('article');
if (!article) throw new Error('The WPS clipboard fixture has no article element.');

const messageId = 'wps-clipboard-fixture';
const parsed = parseMessageContentResult(article, messageId, 'en');
const timestamp = '2026-07-03T11:00:00.000Z';
const document: ChatDocument = {
  version: 1,
  title: 'WPS editable clipboard fixture',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/wps-clipboard-fixture',
    capturedAt: timestamp,
  },
  exportedAt: timestamp,
  messages: [{
    id: messageId,
    role: 'assistant',
    order: 0,
    selected: true,
    status: 'complete',
    content: parsed.content,
  }],
  warnings: parsed.warnings,
};
const request: ExportRequest = {
  document,
  selection: { scope: 'single-response', messageId },
  options: {
    codeStyle: 'document',
    fileName: 'wps-editable-clipboard-fixture',
    format: 'docx',
    includePrompts: true,
    language: 'en',
    paper: 'letter',
    theme: 'light',
  },
};
const blob = await renderStructuredDocxBlob(request);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, new Uint8Array(await blob.arrayBuffer()));
process.stdout.write(`${JSON.stringify({
  file: path.relative(root, outputPath),
  size: blob.size,
  warnings: parsed.warnings.length,
}, null, 2)}\n`);
