import JSZip from 'jszip';
import { Paragraph } from 'docx';
import { describe, expect, it } from 'vitest';

import type { ChatDocument } from '../../../src/document/ast';
import type { ExportRequest } from '../../../src/document/export';
import {
  type BlobDownloadAdapter,
  downloadBlob,
  ensureFileExtension,
} from '../../../src/downloads/browser-download';
import {
  DOCX_MIME_TYPE,
  renderDocxBlob,
} from '../../../src/renderers/docx/docx-foundation';

const documentFixture: ChatDocument = {
  version: 1,
  title: 'DOCX Foundation 验证',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/docx-foundation',
    capturedAt: '2026-06-22T06:00:00.000Z',
  },
  exportedAt: '2026-06-22T06:01:00.000Z',
  messages: [],
  warnings: [],
};

function request(paper: ExportRequest['options']['paper']): ExportRequest {
  return {
    document: documentFixture,
    selection: { scope: 'full-conversation' },
    options: {
      codeStyle: 'document',
      fileName: 'docx-foundation',
      format: 'docx',
      includePrompts: true,
      language: 'zh-CN',
      paper,
      theme: 'light',
    },
  };
}

async function xmlFrom(blob: Blob, path: string): Promise<string> {
  const archive = await JSZip.loadAsync(await blob.arrayBuffer());
  const entry = archive.file(path);
  if (!entry) throw new Error(`Missing OOXML part: ${path}`);
  return entry.async('string');
}

describe('DOCX foundation', () => {
  it.each([
    ['a4', 'w:w="11905"', 'w:h="16837"'],
    ['letter', 'w:w="12240"', 'w:h="15840"'],
  ] as const)('packs a valid %s OOXML document with metadata and styles', async (
    paper,
    expectedWidth,
    expectedHeight,
  ) => {
    const blob = await renderDocxBlob(request(paper), [
      new Paragraph('Browser-local DOCX foundation.'),
    ]);

    expect(blob.type).toBe(DOCX_MIME_TYPE);
    expect(blob.size).toBeGreaterThan(1_000);

    const contentTypes = await xmlFrom(blob, '[Content_Types].xml');
    const core = await xmlFrom(blob, 'docProps/core.xml');
    const documentXml = await xmlFrom(blob, 'word/document.xml');
    const styles = await xmlFrom(blob, 'word/styles.xml');

    expect(contentTypes).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    );
    expect(core).toContain('<dc:title>DOCX Foundation 验证</dc:title>');
    expect(core).toContain('<dc:creator>ChatGPT2Doc</dc:creator>');
    expect(core).toContain('renderer:m16.1-chat12-14-tex-delimiters');
    expect(core).toContain('trace:v1 snapshot:s1-');
    expect(documentXml).toContain('DOCX Foundation 验证');
    expect(documentXml).toContain('Browser-local DOCX foundation.');
    expect(documentXml).toContain(expectedWidth);
    expect(documentXml).toContain(expectedHeight);
    expect(documentXml).toContain('w:top="1440"');
    expect(styles).toContain('w:eastAsia="Noto Sans CJK SC"');
    expect(styles).toContain('w:ascii="Noto Serif"');
    expect(styles).toContain('w:val="Title"');
  });

  it('normalizes the extension and revokes the object URL after triggering download', () => {
    const calls: string[] = [];
    const adapter: BlobDownloadAdapter = {
      createObjectUrl: () => 'blob:docx-foundation',
      defer: (callback) => callback(),
      revokeObjectUrl: (url) => calls.push(`revoke:${url}`),
      trigger: (url, fileName) => calls.push(`trigger:${url}:${fileName}`),
    };
    const blob = new Blob(['docx'], { type: DOCX_MIME_TYPE });

    downloadBlob(blob, ensureFileExtension('research export', '.docx'), adapter);

    expect(calls).toEqual([
      'trigger:blob:docx-foundation:research export.docx',
      'revoke:blob:docx-foundation',
    ]);
    expect(ensureFileExtension('existing.DOCX', '.docx')).toBe('existing.DOCX');
    expect(ensureFileExtension('  ', '.docx')).toBe('chat-export.docx');
  });
});
