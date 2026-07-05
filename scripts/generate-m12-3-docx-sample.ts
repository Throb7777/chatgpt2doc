import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

import type { BlockNode, ChatDocument, InlineNode } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { parseMessageContentResult } from '../src/platform/chatgpt/content-parser';
import { renderStructuredDocx } from '../src/renderers/docx/docx-node-renderer';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fixturePath = path.resolve('tests/fixtures/chatgpt/m12-semantic-boundaries.html');
const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
  url: 'https://chatgpt.com/c/m12-semantic',
});
const element = dom.window.document.querySelector<HTMLElement>('[data-message-id="m12-semantic"]');
assert(element, 'M12.3 semantic fixture message is missing.');
const parsed = parseMessageContentResult(element, 'm12-semantic');
const inlineSources = ['q=3', '\\Delta t_{gap}', 'W_{gap}', 'x_u(t)', 'R_{UA}', 'T_m^\\alpha'];
const inlineChildren: InlineNode[] = [{ kind: 'text', value: 'Additional inline matrix: ' }];
inlineSources.forEach((source, index) => {
  inlineChildren.push({
    fallbackText: source,
    kind: 'mathInline',
    provenance: 'explicit',
    source,
    sourceFormat: 'tex',
  });
  if (index < inlineSources.length - 1) inlineChildren.push({ kind: 'text', value: ', ' });
});
inlineChildren.push({ kind: 'text', value: '.' });

const displaySources = [
  '\\frac{a}{b}',
  'x_i^2',
  '\\sqrt[3]{x}',
  '\\sum_{i=1}^{n} i',
  '\\int_0^1 x\\,dx',
  '\\left( a+b \\right)',
  '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}',
  '\\alpha + \\beta \\le \\infty',
  '\\mathcal{T}_m^\\alpha \\rightarrow R_{UA} \\subseteq Z_{int}',
  '\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}',
  'q=3',
  '\\Delta t_{gap}',
  'v_u(t)',
  'a_u(t)=\\{release,hold,v_u(t)\\}',
  'R_{UA}',
  'Z_{int}',
  'T_m^\\alpha',
  'W_{gap}',
  'x_u(t)=(c_u,s_u,v_u,q_u)',
  'q_u(t)\\in\\{1,2,3,4\\}',
];
const displayBlocks: BlockNode[] = displaySources.map((source) => ({
  fallbackText: source,
  kind: 'mathBlock',
  provenance: 'explicit',
  source,
  sourceFormat: 'tex',
}));
parsed.content.push({ children: inlineChildren, kind: 'paragraph' }, ...displayBlocks);

const document: ChatDocument = {
  version: 1,
  title: 'M12.3 Sanitized DOCX Fidelity Fixture',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/m12-semantic',
    capturedAt: '2026-06-28T02:00:00.000Z',
  },
  exportedAt: '2026-06-28T02:01:00.000Z',
  messages: [{
    content: parsed.content,
    id: 'm12-semantic',
    order: 0,
    role: 'assistant',
    selected: true,
    status: 'complete',
  }],
  warnings: parsed.warnings,
};
const request: ExportRequest = {
  document,
  selection: { scope: 'single-response', messageId: 'm12-semantic' },
  options: {
    codeStyle: 'document',
    fileName: 'm12-3-docx-fidelity',
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
const mathParagraphCount = documentXml.match(/<m:oMathPara>/gu)?.length ?? 0;
const textFigureStyle = stylesXml.match(
  /<w:style[^>]+w:styleId="ChatExportTextFigure"[\s\S]*?<\/w:style>/u,
)?.[0] ?? '';

assert(mathCount === 31, `Expected 31 editable equations, received ${mathCount}.`);
assert(mathParagraphCount === 20, `Expected 20 display equations, received ${mathParagraphCount}.`);
assert(!/<w:t[^>]*>[^<]*τ∈\[0,H\]/u.test(documentXml), 'Tau interval leaked as plain Word text.');
assert(documentXml.includes('w:pStyle w:val="ChatExportTextFigure"'), 'Text-figure style is missing.');
assert(documentXml.includes('w:pStyle w:val="ChatExportCode"'), 'Source-code style is missing.');
assert(documentXml.includes('┌──── local overlap'), 'Text-figure first line is missing.');
assert(documentXml.includes('│  ● → ■'), 'Text-figure symbol line is missing.');
assert(documentXml.includes('└──── R_UA'), 'Text-figure final line is missing.');
assert(textFigureStyle.includes('Noto Serif'), 'Unified text-figure serif font is missing.');
assert(!textFigureStyle.includes('<w:shd'), 'Text-figure style must not have code shading.');

const outputDir = path.resolve('docs/qa-artifacts/m12-3');
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'm12-3-docx-fidelity.docx');
const reportPath = path.join(outputDir, 'm12-3-report.json');
await writeFile(outputPath, new Uint8Array(await result.blob.arrayBuffer()));
await writeFile(reportPath, `${JSON.stringify({
  file: path.relative(process.cwd(), outputPath),
  mathCount,
  mathParagraphCount,
  plainTauCount: documentXml.match(/<w:t[^>]*>[^<]*τ∈\[0,H\]/gu)?.length ?? 0,
  size: result.blob.size,
  textFigureStyle: 'ChatExportTextFigure',
  warningCodes: result.warnings.map(({ code }) => code),
}, null, 2)}\n`);
process.stdout.write(await readFile(reportPath, 'utf8'));
