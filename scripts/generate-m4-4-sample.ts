import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { BlockNode, ChatDocument } from '../src/document/ast';
import type { ExportRequest } from '../src/document/export';
import { renderStructuredDocxBlob } from '../src/renderers/docx/docx-node-renderer';

const expressions = [
  ['Inline equation', 'E=mc^2'],
  ['Fraction', '\\frac{a}{b}'],
  ['Subscript and superscript', 'x_i^2'],
  ['Root with degree', '\\sqrt[3]{x}'],
  ['Summation', '\\sum_{i=1}^{n} i'],
  ['Integral', '\\int_0^1 x\\,dx'],
  ['Delimiters', '\\left( a+b \\right)'],
  ['Matrix', '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}'],
  ['Symbols', '\\alpha + \\beta \\le \\infty'],
] as const;

const content: BlockNode[] = [{
  children: [{ kind: 'text', value: 'M4.4 Editable Word Equation Matrix' }],
  kind: 'heading',
  level: 1,
}];
for (const [label, source] of expressions) {
  content.push(
    {
      children: [{ kind: 'text', value: `${label}: ${source}` }],
      kind: 'heading',
      level: 2,
    },
    { fallbackText: source, kind: 'mathBlock', source, sourceFormat: 'tex' },
  );
}
content.push(
  {
    children: [{ kind: 'text', value: 'Unsupported command fallback' }],
    kind: 'heading',
    level: 2,
  },
  {
    fallbackText: '[Unsupported math: colored x]',
    kind: 'mathBlock',
    source: '\\color{red}{x}',
    sourceFormat: 'tex',
  },
);

const document: ChatDocument = {
  version: 1,
  title: 'M4.4 Editable Word Equations',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/synthetic-m4-4',
    capturedAt: '2026-06-22T10:00:00.000Z',
  },
  exportedAt: '2026-06-22T10:01:00.000Z',
  messages: [{
    content,
    id: 'assistant-math-sample',
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
    fileName: 'm4-4-editable-equations',
    format: 'docx',
    includePrompts: true,
    language: 'en',
    paper: 'a4',
    theme: 'light',
  },
};

const outputDir = path.join(process.cwd(), 'docs', 'qa-artifacts', 'm4-4');
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'm4-4-editable-equations.docx');
const blob = await renderStructuredDocxBlob(request);
await writeFile(outputPath, new Uint8Array(await blob.arrayBuffer()));
process.stdout.write(`${JSON.stringify({
  expressions: expressions.length,
  file: path.relative(process.cwd(), outputPath),
  size: blob.size,
}, null, 2)}\n`);
