import type {
  DocumentWarning,
  ImageNode,
  ImageSource,
} from '../document/ast';
import type { ExportLanguage } from '../document/export';
import { getExportStrings } from '../localization/strings';

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_HEIGHT = 800;
const DEFAULT_MAX_WIDTH = 600;

export interface RasterizedImage {
  data: Uint8Array;
  height: number;
  width: number;
}

export interface ImageResolverEnvironment {
  fetch(input: string): Promise<Response>;
  rasterize(blob: Blob, maxWidth: number, maxHeight: number): Promise<RasterizedImage>;
}

export interface ImageResolutionContext {
  language?: ExportLanguage;
  messageId?: string;
  nodePath?: number[];
}

export interface ResolvedImage {
  data: Uint8Array;
  height: number;
  status: 'embedded';
  width: number;
}

export interface ImageFallback {
  href?: string;
  status: 'fallback';
  warning: DocumentWarning;
}

export type ImageResolution = ImageFallback | ResolvedImage;
export type ImageResolver = (
  image: ImageNode,
  context?: ImageResolutionContext,
) => Promise<ImageResolution>;

export interface ImageResolverOptions {
  environment?: ImageResolverEnvironment;
  maxBytes?: number;
  maxHeight?: number;
  maxWidth?: number;
}

export function fitImageDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { height: number; width: number } {
  if (![width, height, maxWidth, maxHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Image dimensions and limits must be positive finite numbers.');
  }
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

function warning(
  message: string,
  context: ImageResolutionContext,
): DocumentWarning {
  return {
    code: 'image-unavailable',
    message,
    provenance: {
      stage: 'asset',
      sourceKind: 'image',
      ...(context.messageId ? { messageId: context.messageId } : {}),
      ...(context.nodePath ? { nodePath: context.nodePath } : {}),
    },
  };
}

function fallback(
  image: ImageNode,
  message: string,
  context: ImageResolutionContext,
): ImageFallback {
  const href = image.fallbackHref
    ?? (image.source.kind === 'url' ? image.source.value : undefined);
  return {
    status: 'fallback',
    warning: warning(message, context),
    ...(href ? { href } : {}),
  };
}

async function sourceBlob(
  source: ImageSource | Blob,
  environment: ImageResolverEnvironment,
): Promise<Blob> {
  if (source instanceof Blob) return source;
  const response = await environment.fetch(source.value);
  if (!response.ok) {
    throw new Error(`Image request failed with HTTP ${response.status}.`);
  }
  return response.blob();
}

async function canvasRasterize(
  blob: Blob,
  maxWidth: number,
  maxHeight: number,
): Promise<RasterizedImage> {
  const bitmap = await createImageBitmap(blob);
  try {
    const size = fitImageDimensions(bitmap.width, bitmap.height, maxWidth, maxHeight);
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(size.width, size.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('A 2D canvas context is unavailable.');
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      const output = await canvas.convertToBlob({ type: 'image/png' });
      return {
        data: new Uint8Array(await output.arrayBuffer()),
        ...size,
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('A 2D canvas context is unavailable.');
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const output = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error('Canvas PNG encoding failed.'));
      }, 'image/png');
    });
    return {
      data: new Uint8Array(await output.arrayBuffer()),
      ...size,
    };
  } finally {
    bitmap.close();
  }
}

export function createBrowserImageEnvironment(): ImageResolverEnvironment | null {
  if (typeof fetch !== 'function' || typeof createImageBitmap !== 'function') return null;
  return {
    fetch: (input) => fetch(input, {
      credentials: 'omit',
      method: 'GET',
      referrerPolicy: 'no-referrer',
    }),
    rasterize: canvasRasterize,
  };
}

export async function resolveImageAsset(
  image: ImageNode,
  context: ImageResolutionContext = {},
  options: ImageResolverOptions = {},
): Promise<ImageResolution> {
  const environment = options.environment ?? createBrowserImageEnvironment();
  const strings = getExportStrings(context.language ?? 'en');
  if (!environment) {
    return fallback(image, strings.imageDecodingUnavailable, context);
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  try {
    const blob = await sourceBlob(image.source, environment);
    if (!blob.type.toLowerCase().startsWith('image/')) {
      throw new Error(`Unsupported image content type: ${blob.type || 'unknown'}.`);
    }
    if (blob.size > maxBytes) {
      throw new Error(`Image exceeds the ${maxBytes}-byte local limit.`);
    }
    const rasterized = await environment.rasterize(blob, maxWidth, maxHeight);
    const fitted = fitImageDimensions(
      rasterized.width,
      rasterized.height,
      maxWidth,
      maxHeight,
    );
    return {
      data: rasterized.data,
      height: fitted.height,
      status: 'embedded',
      width: fitted.width,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fallback(image, strings.imageCouldNotBeEmbedded(message), context);
  }
}

export function createImageResolver(options: ImageResolverOptions = {}): ImageResolver {
  return (image, context) => resolveImageAsset(image, context, options);
}
