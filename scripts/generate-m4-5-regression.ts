import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

import type { ImageResolver } from '../src/assets/image-resolver';
import type { ChatDocument, DocumentWarning } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { parseMessageContentResult } from '../src/platform/chatgpt/content-parser';
import {
  createMathFallbackSvg,
  type MathFallbackResolver,
} from '../src/renderers/docx/math-fallback';
import { renderStructuredDocx } from '../src/renderers/docx/docx-node-renderer';

const redPixelPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
));
const root = process.cwd();
const fixturePath = path.join(
  root,
  'tests',
  'fixtures',
  'reference',
  'synthetic-conversation.html',
);
const outputDir = path.join(root, 'docs', 'qa-artifacts', 'm4-5');
await mkdir(outputDir, { recursive: true });

const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
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
const assistant = messages.find(({ role }) => role === 'assistant');
if (!assistant) throw new Error('Synthetic assistant message is missing.');
assistant.content.push({
  fallbackText: 'Unsupported color expression: x',
  kind: 'mathBlock',
  source: '\\color{red}{x}',
  sourceFormat: 'tex',
});

const document: ChatDocument = {
  version: 1,
  title: 'M4.5 Combined DOCX Regression',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/synthetic',
    capturedAt: '2026-06-22T12:00:00.000Z',
  },
  exportedAt: '2026-06-22T12:01:00.000Z',
  messages,
  warnings,
};
const request: ExportRequest = {
  document,
  selection: { scope: 'full-conversation' },
  options: {
    codeStyle: 'document',
    fileName: 'm4-5-combined-regression',
    format: 'docx',
    includePrompts: true,
    language: 'en',
    paper: 'a4',
    theme: 'light',
  },
};
const imageResolver: ImageResolver = async () => ({
  data: redPixelPng,
  height: 180,
  status: 'embedded',
  width: 320,
});
const mathFallbackResolver: MathFallbackResolver = async (node, context) => {
  const svg = createMathFallbackSvg(node);
  return {
    height: svg.height,
    pngData: redPixelPng,
    status: 'embedded',
    svgData: svg.data,
    warning: {
      code: 'math-fallback',
      message: 'Unsupported math was rendered locally as an SVG fallback.',
      provenance: {
        messageId: context?.messageId,
        nodePath: context?.nodePath,
        sourceKind: node.kind,
        stage: 'render',
      },
    },
    width: svg.width,
  };
};
const result = await renderStructuredDocx(request, {
  imageResolver,
  mathFallbackResolver,
});
const bytes = new Uint8Array(await result.blob.arrayBuffer());
const archive = await JSZip.loadAsync(bytes);
const documentXml = await archive.file('word/document.xml')!.async('string');
const contentTypes = await archive.file('[Content_Types].xml')!.async('string');
const mediaEntries = await Promise.all(Object.entries(archive.files)
  .filter(([name, entry]) => name.startsWith('word/media/') && !entry.dir)
  .map(async ([name, entry]) => ({
    name,
    size: (await entry.async('uint8array')).byteLength,
  })));
const inspection = {
  contentTypes: {
    png: contentTypes.includes('image/png'),
    svg: contentTypes.includes('image/svg+xml'),
  },
  document: {
    editableMathObjects: documentXml.match(/<m:oMath>/gu)?.length ?? 0,
    hasCodeStyle: documentXml.includes('w:pStyle w:val="ChatExportCode"'),
    hasHyperlinks: documentXml.includes('<w:hyperlink'),
    hasImageDrawing: documentXml.includes('<w:drawing>'),
    hasNumbering: documentXml.includes('<w:numPr>'),
    hasTable: documentXml.includes('<w:tbl>'),
    hasUnsupportedEquationAltText: documentXml.includes(
      'name="Unsupported equation fallback"',
    ),
  },
  file: 'm4-5-combined-regression.docx',
  media: mediaEntries,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  size: bytes.byteLength,
  warnings: result.warnings,
};
const docxPath = path.join(outputDir, inspection.file);
const inspectionPath = path.join(outputDir, 'package-inspection.json');
await writeFile(docxPath, bytes);
await writeFile(inspectionPath, `${JSON.stringify(inspection, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  file: path.relative(root, docxPath),
  inspection: path.relative(root, inspectionPath),
  media: mediaEntries.length,
  size: bytes.byteLength,
  warnings: result.warnings.length,
}, null, 2)}\n`);
