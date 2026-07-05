import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it, vi } from 'vitest';

import type { ChatDocument } from '../../../src/document/ast';
import type { ExportRequest } from '../../../src/document/export';
import { nodePdfFontEnvironment } from '../../../scripts/lib/node-pdf-font-environment';
import {
  type BlobDownloadAdapter,
  downloadBlob,
  ensureFileExtension,
} from '../../../src/downloads/browser-download';
import {
  createBrowserPdfFontEnvironment,
  fontFragmentForCodePoint,
} from '../../../src/renderers/pdf/pdf-fonts';
import {
  PDF_MIME_TYPE,
  renderPdfBlob,
} from '../../../src/renderers/pdf/pdf-foundation';

const documentFixture: ChatDocument = {
  version: 1,
  title: 'M5.1 PDF Foundation \u9a8c\u8bc1',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/pdf-foundation',
    capturedAt: '2026-06-22T12:00:00.000Z',
  },
  exportedAt: '2026-06-22T12:01:00.000Z',
  messages: [],
  warnings: [],
};

const nodeFontEnvironment = nodePdfFontEnvironment;

function request(paper: ExportRequest['options']['paper']): ExportRequest {
  return {
    document: documentFixture,
    selection: { scope: 'full-conversation' },
    options: {
      codeStyle: 'document',
      fileName: 'pdf-foundation',
      format: 'pdf',
      includePrompts: true,
      language: 'zh-CN',
      paper,
      theme: 'light',
    },
  };
}

async function extractedText(blob: Blob): Promise<string> {
  const loadingTask = getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .filter((item): item is typeof item & { str: string } => 'str' in item)
    .map(({ str }) => str)
    .join('');
}

describe('PDF foundation', () => {
  it('routes Unicode to bundled static TTF fonts in the browser', async () => {
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      requests.push(String(input));
      return new Response(new Uint8Array([0, 1, 2, 3]));
    }));

    try {
      const bytes = await createBrowserPdfFontEnvironment().loadFragment('cjk-regular');

      expect(fontFragmentForCodePoint('\u4e2d'.codePointAt(0) as number)).toBe('cjk-regular');
      expect(fontFragmentForCodePoint('\u2016'.codePointAt(0) as number)).toBe('math');
      expect(requests).toHaveLength(1);
      expect(requests[0]).toContain('noto-sans-sc-regular.ttf');
      expect(requests[0]).not.toContain('data:');
      expect(bytes).toEqual(new Uint8Array([0, 1, 2, 3]));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['a4', 595.28, 841.89],
    ['letter', 612, 792],
  ] as const)('creates a searchable bilingual %s PDF with metadata and fonts', async (
    paper,
    expectedWidth,
    expectedHeight,
  ) => {
    const bilingualText = 'Searchable English and \u4e2d\u6587 text.';
    const blob = await renderPdfBlob(request(paper), [
      { text: bilingualText },
      { text: `Paper setting: ${paper.toUpperCase()}` },
    ], { fontEnvironment: nodeFontEnvironment });

    expect(blob.type).toBe(PDF_MIME_TYPE);
    expect(blob.size).toBeGreaterThan(2_000);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const document = await PDFDocument.load(bytes);
    const [page] = document.getPages();
    const rawPdf = new TextDecoder('latin1').decode(bytes);

    expect(page).toBeDefined();
    if (!page) throw new Error('Expected the PDF foundation to contain one page');
    expect(page.getWidth()).toBeCloseTo(expectedWidth, 1);
    expect(page.getHeight()).toBeCloseTo(expectedHeight, 1);
    expect(document.getTitle()).toBe(documentFixture.title);
    expect(document.getAuthor()).toBe('ChatGPT2Doc');
    expect(document.getCreator()).toBe('ChatGPT2Doc');
    expect(document.getSubject()).toContain('renderer:m16.1-chat12-14-tex-delimiters');
    expect(document.getSubject()).toContain('trace:v1 snapshot:s1-');
    const creationDate = document.getCreationDate();
    expect(creationDate).toBeDefined();
    expect(creationDate?.toISOString()).toBe(documentFixture.exportedAt);
    expect(rawPdf).toContain('/ToUnicode');
    expect(rawPdf).toContain('/FontFile2');
    expect(await extractedText(blob)).toContain(bilingualText);
  });

  it('downloads through the shared Blob adapter with a normalized PDF extension', async () => {
    const calls: string[] = [];
    const adapter: BlobDownloadAdapter = {
      createObjectUrl: () => 'blob:pdf-foundation',
      defer: (callback) => callback(),
      revokeObjectUrl: (url) => calls.push(`revoke:${url}`),
      trigger: (url, fileName) => calls.push(`trigger:${url}:${fileName}`),
    };
    const blob = await renderPdfBlob(request('a4'), [], {
      fontEnvironment: nodeFontEnvironment,
    });

    downloadBlob(blob, ensureFileExtension('research export', '.pdf'), adapter);

    expect(calls).toEqual([
      'trigger:blob:pdf-foundation:research export.pdf',
      'revoke:blob:pdf-foundation',
    ]);
    expect(ensureFileExtension('existing.PDF', '.pdf')).toBe('existing.PDF');
  });
});
