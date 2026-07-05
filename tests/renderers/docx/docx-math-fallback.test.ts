import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ChatDocument,
  DocumentWarning,
  MathBlockNode,
} from '../../../src/document/ast';
import type { ExportRequest } from '../../../src/document/export';
import {
  createMathFallbackSvg,
  resolveMathFallback,
  type MathFallbackResolver,
} from '../../../src/renderers/docx/math-fallback';
import {
  renderStructuredDocx,
} from '../../../src/renderers/docx/docx-node-renderer';

const redPixelPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
));

afterEach(() => {
  vi.unstubAllGlobals();
});

function unsupportedMath(): MathBlockNode {
  return {
    fallbackText: 'x < y & "quoted"',
    kind: 'mathBlock',
    source: '\\color{red}{x}',
    sourceFormat: 'tex',
  };
}

function warning(messageId = 'assistant-fallback'): DocumentWarning {
  return {
    code: 'math-fallback',
    message: 'Synthetic SVG fallback.',
    provenance: {
      messageId,
      nodePath: [0],
      sourceKind: 'mathBlock',
      stage: 'render',
    },
  };
}

function request(content = [unsupportedMath()]): ExportRequest {
  const document: ChatDocument = {
    version: 1,
    title: 'Math Fallback Fixture',
    source: {
      platform: 'chatgpt',
      url: 'https://chatgpt.com/c/math-fallback',
      capturedAt: '2026-06-22T11:00:00.000Z',
    },
    exportedAt: '2026-06-22T11:01:00.000Z',
    messages: [{
      content,
      id: 'assistant-fallback',
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
      fileName: 'math-fallback',
      format: 'docx',
      includePrompts: true,
      language: 'en',
      paper: 'a4',
      theme: 'light',
    },
  };
}

describe('DOCX math fallback', () => {
  it('creates a local SVG with XML-safe visible source text and a PNG raster fallback', async () => {
    const node = unsupportedMath();
    const rasterize = vi.fn(async (blob: Blob) => {
      expect(blob.type).toBe('image/svg+xml');
      const svg = await blob.text();
      expect(svg).toContain('x &lt; y &amp; &quot;quoted&quot;');
      return { data: redPixelPng, height: 88, width: 424 };
    });

    const result = await resolveMathFallback(
      node,
      { messageId: 'assistant-fallback', nodePath: [0] },
      {
        environment: {
          fetch: vi.fn(),
          rasterize,
        },
      },
    );

    expect(result).toMatchObject({
      status: 'embedded',
      warning: {
        code: 'math-fallback',
        provenance: {
          messageId: 'assistant-fallback',
          nodePath: [0],
          sourceKind: 'mathBlock',
          stage: 'render',
        },
      },
    });
    expect(rasterize).toHaveBeenCalledOnce();
  });

  it('uses an image-element SVG rasterizer when createImageBitmap cannot decode the SVG blob', async () => {
    const drawImage = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:math-fallback');
    const revokeObjectURL = vi.fn();
    class FakeImage {
      height = 88;
      naturalHeight = 88;
      naturalWidth = 424;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      width = 424;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        getContext: vi.fn(() => ({ drawImage })),
        height: 0,
        toBlob: vi.fn((callback: (value: Blob | null) => void) =>
          callback(new Blob([redPixelPng], { type: 'image/png' }))),
        width: 0,
      })),
    });

    const result = await resolveMathFallback(
      unsupportedMath(),
      { messageId: 'assistant-fallback', nodePath: [0] },
      {
        environment: {
          fetch: vi.fn(),
          rasterize: vi.fn(async () => {
            throw new Error('The source image could not be decoded.');
          }),
        },
      },
    );

    expect(result.status).toBe('embedded');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(FakeImage),
      0,
      0,
      360,
      75,
    );
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:math-fallback');
  });

  it('packages SVG and PNG media and returns a provenance-bearing warning', async () => {
    const node = unsupportedMath();
    const svg = createMathFallbackSvg(node);
    const resolver: MathFallbackResolver = async () => ({
      height: svg.height,
      pngData: redPixelPng,
      status: 'embedded',
      svgData: svg.data,
      warning: warning(),
      width: svg.width,
    });
    const result = await renderStructuredDocx(request([node]), {
      mathFallbackResolver: resolver,
    });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );
    const documentXml = await archive.file('word/document.xml')!.async('string');
    const svgName = media.find((name) => name.endsWith('.svg'));

    expect(media.some((name) => name.endsWith('.svg'))).toBe(true);
    expect(media.some((name) => name.endsWith('.png'))).toBe(true);
    expect(await archive.file(svgName!)!.async('string')).toContain(
      'x &lt; y &amp; &quot;quoted&quot;',
    );
    expect(documentXml).toContain('name="Unsupported equation fallback"');
    expect(documentXml).toContain('descr="x &lt; y &amp; &quot;quoted&quot;"');
    expect(result.warnings).toEqual([warning()]);
  });

  it('keeps text visible and warns when SVG rasterization is unavailable', async () => {
    const node = unsupportedMath();
    const expectedWarning = warning();
    expectedWarning.message = 'Synthetic fallback failure.';
    const resolver: MathFallbackResolver = async () => ({
      status: 'text',
      warning: expectedWarning,
    });
    const result = await renderStructuredDocx(request([node]), {
      mathFallbackResolver: resolver,
    });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const documentXml = await archive.file('word/document.xml')!.async('string');

    expect(documentXml).toContain('x &lt; y &amp; &quot;quoted&quot;');
    expect(result.warnings).toEqual([expectedWarning]);
  });

  it('does not invoke fallback for supported editable equations', async () => {
    const resolver = vi.fn<MathFallbackResolver>();
    const result = await renderStructuredDocx(
      request([{
        fallbackText: 'a/b',
        kind: 'mathBlock',
        source: '\\frac{a}{b}',
        sourceFormat: 'tex',
      }]),
      { mathFallbackResolver: resolver },
    );
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const documentXml = await archive.file('word/document.xml')!.async('string');

    expect(documentXml).toContain('<m:f>');
    expect(resolver).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([]);
  });
});
