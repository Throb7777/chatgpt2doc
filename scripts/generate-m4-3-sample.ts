import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { ImageResolver } from '../src/assets/image-resolver';
import type { ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { renderStructuredDocx } from '../src/renderers/docx/docx-node-renderer';

const redPixelPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
));
const outputDir = path.join(process.cwd(), 'docs', 'qa-artifacts', 'm4-3');
await mkdir(outputDir, { recursive: true });

const document: ChatDocument = {
  version: 1,
  title: 'M4.3 Image Embedding 验证',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/synthetic-m4-3',
    capturedAt: '2026-06-22T09:00:00.000Z',
  },
  exportedAt: '2026-06-22T09:01:00.000Z',
  messages: [{
    content: [
      {
        kind: 'heading',
        level: 1,
        children: [{ kind: 'text', value: 'Embedded local image' }],
      },
      {
        alt: 'Synthetic red square',
        kind: 'image',
        source: { kind: 'data-url', value: 'data:image/png;base64,synthetic' },
        title: 'Project-owned synthetic image',
      },
      {
        kind: 'heading',
        level: 1,
        children: [{ kind: 'text', value: 'Remote failure fallback' }],
      },
      {
        alt: 'Unavailable remote chart',
        fallbackHref: 'https://example.com/unavailable-chart.png',
        kind: 'image',
        source: { kind: 'url', value: 'https://example.com/unavailable-chart.png' },
      },
    ],
    id: 'assistant-image-sample',
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
    fileName: 'm4-3-image-embedding',
    format: 'docx',
    includePrompts: true,
    language: 'zh-CN',
    paper: 'a4',
    theme: 'light',
  },
};
const resolver: ImageResolver = async (image, context) => {
  if (image.source.kind === 'data-url') {
    return {
      data: redPixelPng,
      height: 240,
      status: 'embedded',
      width: 240,
    };
  }
  return {
    href: image.fallbackHref,
    status: 'fallback',
    warning: {
      code: 'image-unavailable',
      message: 'Synthetic remote image failure for M4.3 acceptance.',
      provenance: {
        messageId: context?.messageId,
        nodePath: context?.nodePath,
        sourceKind: 'image',
        stage: 'asset',
      },
    },
  };
};
const result = await renderStructuredDocx(request, { imageResolver: resolver });
const docxPath = path.join(outputDir, 'm4-3-image-embedding.docx');
const warningPath = path.join(outputDir, 'warnings.json');
await writeFile(docxPath, new Uint8Array(await result.blob.arrayBuffer()));
await writeFile(warningPath, `${JSON.stringify(result.warnings, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  file: path.relative(process.cwd(), docxPath),
  size: result.blob.size,
  warnings: result.warnings.length,
}, null, 2)}\n`);
