import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import type { ChatDocument, ImageNode } from '../../../src/document/ast';
import type { ExportRequest } from '../../../src/document/export';
import type { ImageResolver } from '../../../src/assets/image-resolver';
import {
  renderStructuredDocx,
} from '../../../src/renderers/docx/docx-node-renderer';

const transparentPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lC3B4QAAAABJRU5ErkJggg==',
  'base64',
));

function imageNode(): ImageNode {
  return {
    alt: 'Synthetic chart',
    fallbackHref: 'https://example.com/chart.png',
    kind: 'image',
    source: { kind: 'url', value: 'https://example.com/chart.png' },
    title: 'Chart title',
  };
}

function request(): ExportRequest {
  const document: ChatDocument = {
    version: 1,
    title: 'Image DOCX Fixture',
    source: {
      platform: 'chatgpt',
      url: 'https://chatgpt.com/c/image-docx',
      capturedAt: '2026-06-22T08:00:00.000Z',
    },
    exportedAt: '2026-06-22T08:01:00.000Z',
    messages: [{
      content: [imageNode()],
      id: 'assistant-image',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }],
    warnings: [],
  };
  return {
    document,
    selection: { scope: 'full-conversation' },
    options: {
      codeStyle: 'document',
      fileName: 'image-docx',
      format: 'docx',
      includePrompts: true,
      language: 'en',
      paper: 'a4',
      theme: 'light',
    },
  };
}

async function readPackage(blob: Blob): Promise<{
  archive: JSZip;
  documentXml: string;
  relationships: string;
}> {
  const archive = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await archive.file('word/document.xml')!.async('string');
  const relationships = await archive.file('word/_rels/document.xml.rels')!.async('string');
  return { archive, documentXml, relationships };
}

describe('DOCX image rendering', () => {
  it('embeds locally resolved PNG media with bounded aspect-aware dimensions and alt text', async () => {
    const resolver: ImageResolver = async () => ({
      data: transparentPng,
      height: 300,
      status: 'embedded',
      width: 600,
    });
    const result = await renderStructuredDocx(request(), { imageResolver: resolver });
    const { archive, documentXml, relationships } = await readPackage(result.blob);
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );

    expect(media).toHaveLength(1);
    expect(media[0]).toMatch(/\.png$/);
    expect(documentXml).toContain('descr="Synthetic chart"');
    expect(documentXml).toContain('cx="5715000"');
    expect(documentXml).toContain('cy="2857500"');
    expect(relationships).toContain('/relationships/image');
    expect(result.warnings).toEqual([]);
  });

  it('retains a clickable source and structured warning when embedding fails', async () => {
    const resolver: ImageResolver = async (_image, context) => ({
      href: 'https://example.com/chart.png',
      status: 'fallback',
      warning: {
        code: 'image-unavailable',
        message: 'Synthetic failure.',
        provenance: {
          messageId: context?.messageId,
          nodePath: context?.nodePath,
          sourceKind: 'image',
          stage: 'asset',
        },
      },
    });
    const result = await renderStructuredDocx(request(), { imageResolver: resolver });
    const { archive, documentXml, relationships } = await readPackage(result.blob);

    expect(Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    )).toEqual([]);
    expect(documentXml).toContain('[Image unavailable: Synthetic chart]');
    expect(documentXml).toContain('<w:hyperlink');
    expect(relationships).toContain('Target="https://example.com/chart.png"');
    expect(result.warnings).toEqual([{
      code: 'image-unavailable',
      message: 'Synthetic failure.',
      provenance: {
        messageId: 'assistant-image',
        nodePath: [0],
        sourceKind: 'image',
        stage: 'asset',
      },
    }]);
  });
});
