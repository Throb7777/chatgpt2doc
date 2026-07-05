import {
  createBrowserImageEnvironment,
  fitImageDimensions,
  type ImageResolverEnvironment,
  type RasterizedImage,
} from '../../assets/image-resolver';
import type {
  DocumentWarning,
  MathBlockNode,
  MathInlineNode,
} from '../../document/ast';
import type { ExportLanguage } from '../../document/export';
import { getExportStrings } from '../../localization/strings';

export type MathNode = MathBlockNode | MathInlineNode;

export interface MathFallbackContext {
  language?: ExportLanguage;
  messageId?: string;
  nodePath?: number[];
}

export interface EmbeddedMathFallback {
  height: number;
  pngData: Uint8Array;
  status: 'embedded';
  svgData: Uint8Array;
  warning: DocumentWarning;
  width: number;
}

export interface TextMathFallback {
  status: 'text';
  warning: DocumentWarning;
}

export type MathFallbackResolution = EmbeddedMathFallback | TextMathFallback;
export type MathFallbackResolver = (
  node: MathNode,
  context?: MathFallbackContext,
) => Promise<MathFallbackResolution>;

export interface MathFallbackOptions {
  environment?: ImageResolverEnvironment;
}

const encoder = new TextEncoder();

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('Canvas PNG encoding failed.'));
    }, 'image/png');
  });
}

async function rasterizeSvgWithImageElement(
  blob: Blob,
  maxWidth: number,
  maxHeight: number,
): Promise<RasterizedImage> {
  if (
    typeof document === 'undefined'
    || typeof Image !== 'function'
    || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function'
  ) {
    throw new Error('browser SVG image decoding is unavailable');
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const value = new Image();
      value.onload = () => resolve(value);
      value.onerror = () => reject(new Error('SVG image element decoding failed.'));
      value.src = objectUrl;
    });
    const width = image.naturalWidth || image.width || maxWidth;
    const height = image.naturalHeight || image.height || maxHeight;
    const size = fitImageDimensions(width, height, maxWidth, maxHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('A 2D canvas context is unavailable.');
    context.drawImage(image, 0, 0, size.width, size.height);
    return {
      data: new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()),
      ...size,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function validXmlText(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint === 0x9
      || codePoint === 0xa
      || codePoint === 0xd
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      ? character
      : '\uFFFD';
  }).join('');
}

function escapeXml(value: string): string {
  return validXmlText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function fallbackWarning(
  node: MathNode,
  context: MathFallbackContext,
  detail?: string,
): DocumentWarning {
  const strings = getExportStrings(context.language ?? 'en');
  return {
    code: 'math-fallback',
    message: detail
      ? strings.mathFallbackFailed(detail)
      : strings.mathFallbackRendered(node.sourceFormat),
    provenance: {
      stage: 'render',
      sourceKind: node.kind,
      ...(context.messageId ? { messageId: context.messageId } : {}),
      ...(context.nodePath ? { nodePath: context.nodePath } : {}),
    },
  };
}

export function createMathFallbackSvg(
  node: MathNode,
  language: ExportLanguage = 'en',
): {
  data: Uint8Array;
  height: number;
  width: number;
} {
  const expression = validXmlText(node.fallbackText || node.source).trim() || node.source;
  const strings = getExportStrings(language);
  const lines = expression.match(/.{1,72}/gu) ?? [strings.unsupportedEquation];
  const width = Math.min(900, Math.max(360, 40 + Math.min(72, expression.length) * 8));
  const height = 64 + lines.length * 24;
  const lineElements = lines.map((line, index) => (
    `<text x="20" y="${58 + index * 24}" font-family="Cambria Math, Microsoft YaHei, sans-serif" font-size="18" fill="#111827">${escapeXml(line)}</text>`
  )).join('');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>${escapeXml(strings.unsupportedEquationFallbackName)}</title>`,
    `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="6" fill="#F8FAFC" stroke="#CBD5E1"/>`,
    `<text x="20" y="30" font-family="Aptos, Microsoft YaHei, sans-serif" font-size="14" font-weight="600" fill="#475569">${escapeXml(strings.unsupportedEquation)}</text>`,
    lineElements,
    '</svg>',
  ].join('');
  return { data: encoder.encode(svg), height, width };
}

export async function resolveMathFallback(
  node: MathNode,
  context: MathFallbackContext = {},
  options: MathFallbackOptions = {},
): Promise<MathFallbackResolution> {
  const environment = options.environment ?? createBrowserImageEnvironment();
  if (!environment) {
    return {
      status: 'text',
      warning: fallbackWarning(node, context, 'browser image decoding is unavailable'),
    };
  }
  try {
    const svg = createMathFallbackSvg(node, context.language);
    const blob = new Blob([new Uint8Array(svg.data)], { type: 'image/svg+xml' });
    let rasterized: RasterizedImage;
    try {
      rasterized = await environment.rasterize(blob, svg.width, svg.height);
    } catch {
      rasterized = await rasterizeSvgWithImageElement(blob, svg.width, svg.height);
    }
    return {
      height: svg.height,
      pngData: rasterized.data,
      status: 'embedded',
      svgData: svg.data,
      warning: fallbackWarning(node, context),
      width: svg.width,
    };
  } catch (error) {
    return {
      status: 'text',
      warning: fallbackWarning(
        node,
        context,
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

export function createMathFallbackResolver(
  options: MathFallbackOptions = {},
): MathFallbackResolver {
  return (node, context) => resolveMathFallback(node, context, options);
}
