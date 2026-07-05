import JSZip from 'jszip';
import { Paragraph } from 'docx';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import type { ChatDocument } from '../../src/document/ast';
import type { ExportRequest } from '../../src/document/export';
import {
  REFERENCE_EXPORT_PROFILE,
  exportLayoutProfileForPaper,
} from '../../src/renderers/export-layout-profile';
import { renderDocxBlob } from '../../src/renderers/docx/docx-foundation';
import { renderPdfBlob } from '../../src/renderers/pdf/pdf-foundation';
import { nodePdfFontEnvironment } from '../../scripts/lib/node-pdf-font-environment';

const documentFixture: ChatDocument = {
  exportedAt: '2026-06-30T13:00:00.000Z',
  messages: [],
  source: {
    capturedAt: '2026-06-30T12:59:00.000Z',
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/layout-profile',
  },
  title: 'Shared layout profile',
  version: 1,
  warnings: [],
};

function request(format: ExportRequest['options']['format']): ExportRequest {
  return {
    document: documentFixture,
    options: {
      codeStyle: 'document',
      fileName: 'layout-profile',
      format,
      includePrompts: true,
      language: 'en',
      paper: 'letter',
      theme: 'light',
    },
    selection: { scope: 'full-conversation' },
  };
}

async function xmlFrom(blob: Blob, path: string): Promise<string> {
  const archive = await JSZip.loadAsync(await blob.arrayBuffer());
  const entry = archive.file(path);
  if (!entry) throw new Error(`Missing OOXML part: ${path}`);
  return entry.async('string');
}

describe('reference export layout profile', () => {
  it('defines the shared Letter profile used for reference parity gates', () => {
    const profile = exportLayoutProfileForPaper('letter');

    expect(profile).toBe(REFERENCE_EXPORT_PROFILE);
    expect(profile.page.points).toEqual({ height: 792, width: 612 });
    expect(profile.body.fontSizePt).toBe(12);
    expect(profile.headings[2].fontSizePt).toBe(16);
    expect(profile.headings[3].fontSizePt).toBe(14);
    expect(profile.textFigure.fontSizePt).toBe(11);
    expect(profile.code.fontSizePt).not.toBe(profile.textFigure.fontSizePt);
    expect(profile.fonts).toEqual({
      cjk: 'Noto Sans CJK SC',
      code: 'Cascadia Mono',
      serif: 'Noto Serif',
      symbol: 'OpenSymbol',
    });
  });

  it('routes DOCX and PDF page geometry through the same profile tokens', async () => {
    const profile = exportLayoutProfileForPaper('letter');
    const docxBlob = await renderDocxBlob(request('docx'), [
      new Paragraph('Shared profile evidence.'),
    ]);
    const pdfBlob = await renderPdfBlob(request('pdf'), [
      { text: 'Shared profile evidence.' },
    ], { fontEnvironment: nodePdfFontEnvironment });

    const documentXml = await xmlFrom(docxBlob, 'word/document.xml');
    const stylesXml = await xmlFrom(docxBlob, 'word/styles.xml');
    const pdf = await PDFDocument.load(new Uint8Array(await pdfBlob.arrayBuffer()));
    const [page] = pdf.getPages();

    expect(documentXml).toContain(`w:w="${profile.page.docxTwips.width}"`);
    expect(documentXml).toContain(`w:h="${profile.page.docxTwips.height}"`);
    expect(stylesXml).toContain(`w:sz w:val="${profile.body.docxHalfPoints}"`);
    expect(stylesXml).toContain(`w:sz w:val="${profile.headings[2].docxHalfPoints}"`);
    expect(stylesXml).toContain(`w:sz w:val="${profile.headings[3].docxHalfPoints}"`);
    expect(stylesXml).toContain(`w:sz w:val="${profile.textFigure.docxHalfPoints}"`);
    expect(page?.getWidth()).toBe(profile.page.points.width);
    expect(page?.getHeight()).toBe(profile.page.points.height);
  });
});
