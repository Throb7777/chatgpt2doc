import { describe, expect, it } from 'vitest';

import type { ExportRequest } from '../../src/document/export';
import {
  createExportDebugTrace,
  exportDiagnosticFingerprint,
  recordExportDebugTrace,
} from '../../src/export/export-trace';

function request(format: 'docx' | 'pdf', exportedAt: string): ExportRequest {
  return {
    document: {
      exportedAt,
      messages: [{
        content: [{
          children: [{
            fallbackText: 'tau interval',
            kind: 'mathInline',
            source: '\\tau \\in [0,H]',
            sourceFormat: 'tex',
          }],
          kind: 'paragraph',
        }, {
          fallbackText: 'state transition',
          kind: 'mathBlock',
          source: 'Z_{int}\\downarrow q=3',
          sourceFormat: 'tex',
        }, {
          kind: 'codeBlock',
          presentation: 'textFigure',
          value: 'PRIVATE_DIAGRAM_TEXT\nsecond line',
        }],
        id: 'assistant-1',
        order: 0,
        role: 'assistant',
        selected: false,
        status: 'complete',
      }],
      source: {
        capturedAt: exportedAt,
        platform: 'chatgpt',
        url: 'https://chatgpt.com/c/private-id',
      },
      title: 'Private title',
      version: 1,
      warnings: [],
    },
    options: {
      codeStyle: 'document',
      fileName: '',
      format,
      includePrompts: true,
      language: 'zh-CN',
      paper: 'letter',
      theme: 'light',
    },
    selection: { messageId: 'assistant-1', scope: 'single-response' },
  };
}

describe('sanitized export diagnostics', () => {
  it('uses a format-independent snapshot id and records only safe structural evidence', () => {
    const docxTrace = createExportDebugTrace(request('docx', '2026-06-30T12:19:13.000Z'));
    const pdfTrace = createExportDebugTrace(request('pdf', '2026-06-30T12:19:18.000Z'));

    expect(docxTrace.snapshotId).toMatch(/^s1-[0-9a-f]{16}$/u);
    expect(pdfTrace.snapshotId).toBe(docxTrace.snapshotId);
    expect(docxTrace.summary).toEqual({
      emptyPreformattedBlocks: 0,
      mathNodes: 2,
      messages: 1,
      preformattedBlockChars: [32],
      preformattedBlocks: 1,
      texCommands: ['downarrow', 'in', 'tau'],
    });
    expect(docxTrace.messages[0].mathSources).toMatchObject([
      {
        fallbackLength: 12,
        fallbackTexParseable: true,
        kind: 'mathInline',
        path: [0, 0],
        provenance: 'unknown',
        sourceFormat: 'tex',
        sourceLength: 14,
        sourceTexCommands: ['in', 'tau'],
        sourceTexParseable: true,
      },
      {
        fallbackLength: 16,
        fallbackTexParseable: true,
        kind: 'mathBlock',
        path: [1],
        provenance: 'unknown',
        sourceFormat: 'tex',
        sourceLength: 21,
        sourceTexCommands: ['downarrow'],
        sourceTexParseable: true,
      },
    ]);

    const serialized = JSON.stringify(docxTrace);
    expect(serialized).not.toContain('PRIVATE_DIAGRAM_TEXT');
    expect(serialized).not.toContain('Private title');
    expect(serialized).not.toContain('private-id');
    expect(serialized).not.toContain('Z_{int}');
  });

  it('produces compact metadata without private text', () => {
    const fingerprint = exportDiagnosticFingerprint(
      request('docx', '2026-06-30T12:19:13.000Z'),
    );

    expect(fingerprint).toMatch(
      /^trace:v1 snapshot:s1-[0-9a-f]{16} messages:1 math:2 pre:1 empty:0 preChars:32 tex:downarrow,in,tau$/u,
    );
    expect(fingerprint).not.toContain('PRIVATE_DIAGRAM_TEXT');
  });

  it('canonicalizes preformatted trailing newlines for cross-format fingerprints', () => {
    const docxRequest = request('docx', '2026-06-30T12:19:13.000Z');
    const pdfRequest = request('pdf', '2026-06-30T12:19:18.000Z');
    const block = pdfRequest.document.messages[0].content[2];
    if (block.kind !== 'codeBlock') throw new Error('Fixture expected a code block.');
    block.value += '\n';

    const docxTrace = createExportDebugTrace(docxRequest);
    const pdfTrace = createExportDebugTrace(pdfRequest);

    expect(pdfTrace.summary.preformattedBlockChars).toEqual(docxTrace.summary.preformattedBlockChars);
    expect(pdfTrace.snapshotId).toBe(docxTrace.snapshotId);
  });

  it('reuses the recorded trace when render metadata requests its fingerprint', () => {
    const exportRequest = request('docx', '2026-06-30T12:19:13.000Z');
    const recorded = recordExportDebugTrace(exportRequest);
    const math = exportRequest.document.messages[0].content[1];
    if (math.kind !== 'mathBlock') throw new Error('Fixture expected a math block.');
    math.source = '\\after-recording';

    const fingerprint = exportDiagnosticFingerprint(exportRequest);

    expect(recorded.summary.texCommands).toEqual(['downarrow', 'in', 'tau']);
    expect(fingerprint).toContain('tex:downarrow,in,tau');
    expect(fingerprint).not.toContain('after-recording');
  });
});
