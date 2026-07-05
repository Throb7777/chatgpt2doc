import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fitImageDimensions,
  resolveImageAsset,
  type ImageResolverEnvironment,
} from '../../src/assets/image-resolver';
import type { ImageNode } from '../../src/document/ast';

function image(source: ImageNode['source']): ImageNode {
  return {
    alt: 'Synthetic chart',
    fallbackHref: source.kind === 'url' ? source.value : undefined,
    kind: 'image',
    source,
  };
}

function environment(response: Response): ImageResolverEnvironment {
  return {
    fetch: vi.fn(async () => response),
    rasterize: vi.fn(async () => ({
      data: new Uint8Array([1, 2, 3]),
      height: 600,
      width: 1200,
    })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local image resolver', () => {
  it('resolves a local data URL and preserves aspect ratio without upscaling', async () => {
    const env = environment(new Response(
      new Blob(['png'], { type: 'image/png' }),
      { status: 200 },
    ));
    const result = await resolveImageAsset(
      image({ kind: 'data-url', value: 'data:image/png;base64,cG5n' }),
      { messageId: 'assistant-1', nodePath: [2] },
      { environment: env, maxHeight: 800, maxWidth: 600 },
    );

    expect(result).toEqual({
      data: new Uint8Array([1, 2, 3]),
      height: 300,
      status: 'embedded',
      width: 600,
    });
    expect(env.fetch).toHaveBeenCalledWith('data:image/png;base64,cG5n');
    expect(env.rasterize).toHaveBeenCalledOnce();
    expect(fitImageDimensions(100, 50, 600, 800)).toEqual({ height: 50, width: 100 });
  });

  it('resolves an accessible remote image without credentials or new permissions', async () => {
    const env = environment(new Response(
      new Blob(['jpeg'], { type: 'image/jpeg' }),
      { status: 200 },
    ));
    const result = await resolveImageAsset(
      image({ kind: 'url', value: 'https://example.com/chart.jpg' }),
      {},
      { environment: env },
    );

    expect(result.status).toBe('embedded');
    expect(env.fetch).toHaveBeenCalledWith('https://example.com/chart.jpg');
  });

  it('uses the default browser bitmap and offscreen-canvas path locally', async () => {
    const drawImage = vi.fn();
    const close = vi.fn();
    const fetchMock = vi.fn(async () => new Response(
      new Blob(['svg'], { type: 'image/svg+xml' }),
      { status: 200 },
    ));
    class FakeOffscreenCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}

      getContext(): { drawImage: typeof drawImage } {
        return { drawImage };
      }

      async convertToBlob(): Promise<Blob> {
        return new Blob(['png-output'], { type: 'image/png' });
      }
    }
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      close,
      height: 600,
      width: 1200,
    })));
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const result = await resolveImageAsset(
      image({ kind: 'url', value: 'https://example.com/chart.svg' }),
    );

    expect(result).toMatchObject({ height: 300, status: 'embedded', width: 600 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/chart.svg',
      {
        credentials: 'omit',
        method: 'GET',
        referrerPolicy: 'no-referrer',
      },
    );
    expect(drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ height: 600, width: 1200 }),
      0,
      0,
      600,
      300,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ['HTTP failure', new Response('', { status: 403 }), 1024],
    ['unsupported content', new Response(new Blob(['html'], { type: 'text/html' })), 1024],
    ['oversized image', new Response(new Blob(['12345'], { type: 'image/png' })), 4],
  ])('retains a linked warning for %s', async (_label, response, maxBytes) => {
    const result = await resolveImageAsset(
      image({ kind: 'url', value: 'https://example.com/chart.png' }),
      { messageId: 'assistant-1', nodePath: [4, 2] },
      { environment: environment(response), maxBytes },
    );

    expect(result).toMatchObject({
      href: 'https://example.com/chart.png',
      status: 'fallback',
      warning: {
        code: 'image-unavailable',
        provenance: {
          messageId: 'assistant-1',
          nodePath: [4, 2],
          sourceKind: 'image',
          stage: 'asset',
        },
      },
    });
  });

  it('rejects invalid dimension inputs instead of producing corrupt media sizes', () => {
    expect(() => fitImageDimensions(0, 10, 600, 800)).toThrow(
      'positive finite numbers',
    );
  });
});
