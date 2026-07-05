import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

import type { ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { parseMessageContentResult } from '../src/platform/chatgpt/content-parser';
import { renderStructuredDocx } from '../src/renderers/docx/docx-node-renderer';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fixturePath = path.resolve('tests/fixtures/chatgpt/m11-real-world-reduced.html');
const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
  url: 'https://chatgpt.com/c/m11-reduced',
});
const element = dom.window.document.querySelector<HTMLElement>('[data-message-id="m11-reduced"]');
assert(element, 'M11.3 reduced fixture message is missing.');
const parsed = parseMessageContentResult(element, 'm11-reduced');
parsed.content.push({
  fallbackText: 'script T sub m sup alpha to R sub UA subset Z sub int',
  kind: 'mathBlock',
  source: '\\mathcal{T}_m^\\alpha \\rightarrow R_{UA} \\subseteq Z_{int}',
  sourceFormat: 'tex',
});

const document: ChatDocument = {
  version: 1,
  title: 'M11.3 Internal Fixture Title',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/m11-reduced',
    capturedAt: '2026-06-27T08:00:00.000Z',
  },
  exportedAt: '2026-06-27T08:01:00.000Z',
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
const request: ExportRequest = {
  document,
  selection: { scope: 'single-response', messageId: 'm11-reduced' },
  options: {
    codeStyle: 'document',
    fileName: 'm11-3-real-world-fidelity',
    format: 'docx',
    includePrompts: true,
    language: 'en',
    paper: 'a4',
    theme: 'light',
  },
};

const result = await renderStructuredDocx(request);
const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
const documentXml = await archive.file('word/document.xml')!.async('string');
const stylesXml = await archive.file('word/styles.xml')!.async('string');
const mathCount = documentXml.match(/<m:oMath>/gu)?.length ?? 0;
const breakCount = documentXml.match(/<w:br\/>/gu)?.length ?? 0;

assert(mathCount === 4, `Expected four editable equations, received ${mathCount}.`);
assert(breakCount === 2, `Expected two text-figure hard breaks, received ${breakCount}.`);
assert(documentXml.includes('<w:tab/>'), 'Text-figure tab was not preserved.');
assert(documentXml.includes('w:pStyle w:val="ChatExportMath"'), 'Display equation style is missing.');
assert(documentXml.includes('𝒯') && documentXml.includes('→') && documentXml.includes('⊆'), 'Academic math symbols are missing.');
assert(documentXml.includes('Noto Serif'), 'Unified text-figure font role is missing.');
assert(!documentXml.includes('M11.3 Internal Fixture Title'), 'Single-response title chrome leaked.');
assert(!documentXml.includes('Assistant'), 'Single-response role chrome leaked.');
assert(!documentXml.includes('draft'), 'Message action state leaked.');
assert(stylesXml.includes('ChatExportCode') && stylesXml.includes('ChatExportMath'), 'DOCX styles are incomplete.');

const outputDir = path.resolve('docs/qa-artifacts/m11-3');
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'm11-3-real-world-fidelity.docx');
const reportPath = path.join(outputDir, 'm11-3-report.json');
await writeFile(outputPath, new Uint8Array(await result.blob.arrayBuffer()));
await writeFile(reportPath, `${JSON.stringify({
  breakCount,
  file: path.relative(process.cwd(), outputPath),
  mathCount,
  size: result.blob.size,
  warningCodes: result.warnings.map(({ code }) => code),
}, null, 2)}\n`);
process.stdout.write(await readFile(reportPath, 'utf8'));
