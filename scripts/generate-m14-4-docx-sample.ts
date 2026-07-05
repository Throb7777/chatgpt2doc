import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

const fixturePath = path.resolve('tests/fixtures/chatgpt/m14-live-export-shapes.html');
const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
  url: 'https://chatgpt.com/c/m14-sanitized-shape',
});
const element = dom.window.document.querySelector<HTMLElement>(
  '[data-message-id="m14-live-export-shapes"]',
);
assert(element, 'M14.4 live-export-shape fixture message is missing.');
const parsed = parseMessageContentResult(element, 'm14-live-export-shapes');
parsed.content.unshift({
  children: [{ kind: 'text', value: 'Live-shape DOCX acceptance' }],
  kind: 'heading',
  level: 2,
});
parsed.content.push({
  items: [
    { children: [{ children: [{ kind: 'text', value: 'Formula semantics preserved' }], kind: 'paragraph' }] },
    { children: [{ children: [{ kind: 'text', value: 'Text-figure grid preserved' }], kind: 'paragraph' }] },
  ],
  kind: 'unorderedList',
});

const document: ChatDocument = {
  version: 1,
  title: 'M14.4 Sanitized Live-Shape DOCX Fixture',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/m14-sanitized-shape',
    capturedAt: '2026-06-29T13:10:00.000Z',
  },
  exportedAt: '2026-06-29T13:11:00.000Z',
  messages: [{
    content: parsed.content,
    id: 'm14-live-export-shapes',
    order: 0,
    role: 'assistant',
    selected: true,
    status: 'complete',
  }],
  warnings: parsed.warnings,
};
const request: ExportRequest = {
  document,
  selection: { scope: 'single-response', messageId: 'm14-live-export-shapes' },
  options: {
    codeStyle: 'document',
    fileName: 'm14-4-docx-live-shape',
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
const mathCount = documentXml.match(/<m:oMath>/gu)?.length ?? 0;
const displayParagraphs = documentXml.match(/<m:oMathPara>[^]*?<\/m:oMathPara>/gu) ?? [];
const textFigureParagraphs = (documentXml.match(/<w:p(?:\s[^>]*)?>[^]*?<\/w:p>/gu) ?? [])
  .filter((paragraph) => paragraph.includes('w:pStyle w:val="ChatExportTextFigure"'));
const textFigureXml = textFigureParagraphs.join('');
const textFigureMathCount = textFigureXml.match(/<m:oMath>/gu)?.length ?? 0;
const plainMathRuns = [
  'τ∈[0,H]',
  'τ∈[0,H]',
  'x_u(t)=(c_u,s_u,v_u,q_u)',
  'q=1→q=2→q=3→q=4',
  'Zint=Tmα∩RUA',
].filter((value) => new RegExp(`<w:t[^>]*>[^<]*${value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u')
  .test(documentXml));

assert(mathCount === 8, `Expected 8 editable equations, received ${mathCount}.`);
assert(displayParagraphs.length === 1,
  `Expected one display equation, received ${displayParagraphs.length}.`);
assert(textFigureParagraphs.length === 2,
  `Expected two text figures, received ${textFigureParagraphs.length}.`);
assert(textFigureMathCount === 0,
  `Expected zero anchored text-figure equations, received ${textFigureMathCount}.`);
assert(plainMathRuns.length === 0,
  `Math leaked as plain Word text: ${plainMathRuns.join(', ')}`);
assert(documentXml.includes('w:pStyle w:val="Heading2"'), 'Heading style is missing.');
assert(documentXml.includes('<w:numPr>'), 'Native Word bullet numbering is missing.');
for (const text of ['local overlap', 'blue ellipse', 'green box', 'control action', '┌───────────┐']) {
  assert(textFigureXml.includes(text), `Text-figure content is missing: ${text}`);
}
assert(!textFigureXml.includes('\\mathcal'), 'Raw TeX leaked into the Word text figure.');
for (const text of ['T_m^α', 'Z_int', 'R_UA', 'v_u(t)']) {
  assert(textFigureXml.includes(text), `Text-figure fixed-grid label is missing: ${text}`);
}
assert(result.warnings.length === 0,
  `Expected no DOCX warnings, received: ${result.warnings.map(({ code }) => code).join(', ')}`);

const outputDir = path.resolve('docs/qa-artifacts/m14-4');
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'm14-4-docx-live-shape.docx');
const reportPath = path.join(outputDir, 'm14-4-report.json');
await writeFile(outputPath, new Uint8Array(await result.blob.arrayBuffer()));
await writeFile(reportPath, `${JSON.stringify({
  displayMathParagraphs: displayParagraphs.length,
  file: path.relative(process.cwd(), outputPath),
  hasHeadingStyle: documentXml.includes('w:pStyle w:val="Heading2"'),
  hasNativeBullets: documentXml.includes('<w:numPr>'),
  mathObjects: mathCount,
  plainMathTextRuns: plainMathRuns,
  size: result.blob.size,
  textFigureMathObjects: textFigureMathCount,
  textFigureParagraphs: textFigureParagraphs.length,
  warningCodes: result.warnings.map(({ code }) => code),
}, null, 2)}\n`);
process.stdout.write(await readFile(reportPath, 'utf8'));
