import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { Paragraph } from 'docx';

import type { ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { renderDocxBlob } from '../src/renderers/docx/docx-foundation';

const outputDir = path.join(process.cwd(), 'docs', 'qa-artifacts', 'm4-1');
await mkdir(outputDir, { recursive: true });

const chatDocument: ChatDocument = {
  version: 1,
  title: 'M4.1 DOCX Foundation 验证',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/synthetic-m4-1',
    capturedAt: '2026-06-22T06:00:00.000Z',
  },
  exportedAt: '2026-06-22T06:01:00.000Z',
  messages: [],
  warnings: [],
};

function request(paper: ExportRequest['options']['paper']): ExportRequest {
  return {
    document: chatDocument,
    selection: { scope: 'full-conversation' },
    options: {
      codeStyle: 'document',
      fileName: `m4-1-${paper}`,
      format: 'docx',
      includePrompts: true,
      language: 'zh-CN',
      paper,
      theme: 'light',
    },
  };
}

const generated = [];
for (const paper of ['a4', 'letter'] as const) {
  const blob = await renderDocxBlob(request(paper), [
    new Paragraph('English and 中文 text render in the same local document.'),
    new Paragraph(`Paper setting: ${paper.toUpperCase()}`),
  ]);
  const fileName = `m4-1-foundation-${paper}.docx`;
  await writeFile(path.join(outputDir, fileName), new Uint8Array(await blob.arrayBuffer()));
  generated.push({ fileName, size: blob.size });
}

process.stdout.write(`${JSON.stringify(generated, null, 2)}\n`);
