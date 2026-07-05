import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  ChatDocument,
  DocumentNode,
  InlineNode,
  ParagraphNode,
} from '../../src/document/ast';
import type {
  ExportRequest,
  ExportScope,
  ExportSelection,
} from '../../src/document/export';

function nodeKind(node: DocumentNode): string {
  switch (node.kind) {
    case 'blockquote':
    case 'citation':
    case 'codeBlock':
    case 'emphasis':
    case 'heading':
    case 'image':
    case 'inlineCode':
    case 'lineBreak':
    case 'link':
    case 'mathBlock':
    case 'mathInline':
    case 'orderedList':
    case 'pageBreak':
    case 'paragraph':
    case 'separator':
    case 'strong':
    case 'table':
    case 'text':
    case 'unorderedList':
      return node.kind;
    default:
      return node satisfies never;
  }
}

const text: InlineNode = { kind: 'text', value: 'English 中文' };
const paragraph: ParagraphNode = { kind: 'paragraph', children: [text] };

const allNodeKinds: DocumentNode[] = [
  text,
  { kind: 'strong', children: [text] },
  { kind: 'emphasis', children: [text] },
  { kind: 'inlineCode', value: '<tag>' },
  { kind: 'link', href: 'https://example.com', children: [text] },
  { kind: 'citation', href: 'https://example.com', label: '[1]' },
  { kind: 'mathInline', source: 'E=mc^2', sourceFormat: 'tex', fallbackText: 'E=mc^2', provenance: 'explicit' },
  { kind: 'lineBreak' },
  paragraph,
  { kind: 'heading', level: 2, children: [text] },
  { kind: 'blockquote', children: [paragraph] },
  { kind: 'orderedList', start: 1, items: [{ children: [paragraph] }] },
  { kind: 'unorderedList', items: [{ children: [paragraph] }] },
  {
    kind: 'table',
    header: { cells: [{ children: [paragraph] }] },
    rows: [{ cells: [{ children: [] }] }],
  },
  { kind: 'codeBlock', language: 'typescript', presentation: 'code', value: 'const value = "<>&";' },
  { kind: 'mathBlock', source: '\\frac{1}{2}', sourceFormat: 'tex', fallbackText: '1/2', provenance: 'explicit' },
  {
    kind: 'image',
    source: { kind: 'url', value: 'https://example.com/chart.svg' },
    alt: 'Synthetic chart',
    fallbackHref: 'https://example.com/chart.svg',
  },
  { kind: 'separator' },
  { kind: 'pageBreak' },
];

const documentFixture: ChatDocument = {
  version: 1,
  title: 'Reference Export Fixture',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/synthetic',
    capturedAt: '2026-06-21T12:00:00.000Z',
  },
  exportedAt: '2026-06-21T12:01:00.000Z',
  messages: [
    {
      id: 'fixture-assistant-1',
      role: 'assistant',
      order: 0,
      selected: true,
      status: 'complete',
      content: [paragraph],
    },
  ],
  warnings: [
    {
      code: 'image-unavailable',
      message: 'Image retained as a source link.',
      provenance: {
        stage: 'asset',
        messageId: 'fixture-assistant-1',
        nodePath: [0],
        sourceKind: 'image',
      },
    },
  ],
};

describe('document and export contracts', () => {
  it('keeps node handling exhaustive and covers every supported discriminant', () => {
    expect(allNodeKinds.map(nodeKind)).toEqual([
      'text',
      'strong',
      'emphasis',
      'inlineCode',
      'link',
      'citation',
      'mathInline',
      'lineBreak',
      'paragraph',
      'heading',
      'blockquote',
      'orderedList',
      'unorderedList',
      'table',
      'codeBlock',
      'mathBlock',
      'image',
      'separator',
      'pageBreak',
    ]);
  });

  it('defines the four scope-specific selection contracts', () => {
    const selections: ExportSelection[] = [
      { scope: 'single-response', messageId: 'fixture-assistant-1' },
      { scope: 'full-conversation' },
      { scope: 'assistant-only' },
      { scope: 'selected-messages', messageIds: ['fixture-assistant-1'] },
    ];

    expect(selections.map(({ scope }) => scope)).toEqual([
      'single-response',
      'full-conversation',
      'assistant-only',
      'selected-messages',
    ] satisfies ExportScope[]);
    expectTypeOf<ExportRequest['selection']>().toEqualTypeOf<ExportSelection>();
  });

  it('round-trips the complete request without losing structured content or warnings', () => {
    const request: ExportRequest = {
      document: documentFixture,
      selection: { scope: 'selected-messages', messageIds: ['fixture-assistant-1'] },
      options: {
        format: 'docx',
        paper: 'a4',
        fileName: 'reference-export-fixture.docx',
        includePrompts: false,
        language: 'zh-CN',
        theme: 'light',
        codeStyle: 'document',
      },
    };

    const serialized = JSON.stringify(request);
    const restored = JSON.parse(serialized) as ExportRequest;

    expect(restored).toEqual(request);
    expect(restored.document.warnings[0]?.provenance).toEqual({
      stage: 'asset',
      messageId: 'fixture-assistant-1',
      nodePath: [0],
      sourceKind: 'image',
    });
  });
});
