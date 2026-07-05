import type { ExportLanguage } from '../document/export';

export interface ExportStrings {
  assistant: string;
  collectionDidNotStabilize(maxSnapshots: number): string;
  exportedDescription: string;
  imageCouldNotBeEmbedded(detail: string): string;
  imageDecodingUnavailable: string;
  imageUnavailable(alt?: string): string;
  inlineImageFallback(label: string): string;
  mathFallbackFailed(detail: string): string;
  mathFallbackRendered(format: string): string;
  missingImageWarning: string;
  nestedInlineImageWarning: string;
  pdfMathFallbackWarning: string;
  preformattedContentDidNotStabilize: string;
  stableMessageIdWarning: string;
  subject: string;
  unsupportedContentWarning(tag: string): string;
  unsupportedEquation: string;
  unsupportedEquationFallbackName: string;
  unsupportedFallback(tag: string, label?: string): string;
  user: string;
}

const EN: ExportStrings = {
  assistant: 'Assistant',
  collectionDidNotStabilize: (maxSnapshots) =>
    `Conversation collection did not stabilize after ${maxSnapshots} snapshots.`,
  exportedDescription:
    'ChatGPT conversation exported locally in the browser by ChatGPT2Doc.',
  imageCouldNotBeEmbedded: (detail) => `Image could not be embedded: ${detail}`,
  imageDecodingUnavailable: 'Image decoding is unavailable in this environment.',
  imageUnavailable: (alt) => alt ? `[Image unavailable: ${alt}]` : '[Image unavailable]',
  inlineImageFallback: (label) => `[Inline image fallback: ${label}]`,
  mathFallbackFailed: (detail) =>
    `Unsupported math remained visible as text because SVG fallback failed: ${detail}`,
  mathFallbackRendered: (format) =>
    `Unsupported ${format.toUpperCase()} math was rendered as an SVG fallback.`,
  missingImageWarning:
    'An image without a usable source was preserved as visible fallback text.',
  nestedInlineImageWarning:
    'A nested inline image was preserved as visible fallback text.',
  pdfMathFallbackWarning:
    'Unsupported PDF math was preserved as visible fallback text.',
  preformattedContentDidNotStabilize:
    'Preformatted content did not stabilize before export.',
  stableMessageIdWarning:
    'One or more semantic messages lacked a stable identifier and were not collected.',
  subject: 'ChatGPT conversation export',
  unsupportedContentWarning: (tag) =>
    `Unsupported <${tag}> content was preserved with a visible fallback.`,
  unsupportedEquation: 'Unsupported equation',
  unsupportedEquationFallbackName: 'Unsupported equation fallback',
  unsupportedFallback: (tag, label) =>
    label ? `[Unsupported ${tag} content: ${label}]` : `[Unsupported ${tag} content]`,
  user: 'User',
};

const ZH_CN: ExportStrings = {
  assistant: '助手',
  collectionDidNotStabilize: (maxSnapshots) =>
    `对话收集在 ${maxSnapshots} 次快照后仍未稳定。`,
  exportedDescription: '由 ChatGPT2Doc 在浏览器中本地导出的 ChatGPT 对话。',
  imageCouldNotBeEmbedded: (detail) => `无法嵌入图片：${detail}`,
  imageDecodingUnavailable: '当前环境无法解码图片。',
  imageUnavailable: (alt) => alt ? `[图片不可用：${alt}]` : '[图片不可用]',
  inlineImageFallback: (label) => `[行内图片回退：${label}]`,
  mathFallbackFailed: (detail) =>
    `SVG 回退失败，不支持的公式已保留为可见文本：${detail}`,
  mathFallbackRendered: (format) =>
    `不支持的 ${format.toUpperCase()} 公式已渲染为 SVG 回退。`,
  missingImageWarning: '没有可用来源的图片已保留为可见回退文本。',
  nestedInlineImageWarning: '嵌套的行内图片已保留为可见回退文本。',
  pdfMathFallbackWarning: '不支持的 PDF 公式已保留为可见回退文本。',
  preformattedContentDidNotStabilize: '预格式化内容在导出前未能稳定加载。',
  stableMessageIdWarning: '一个或多个语义消息缺少稳定标识符，因此未被收集。',
  subject: 'ChatGPT 对话导出',
  unsupportedContentWarning: (tag) =>
    `不支持的 <${tag}> 内容已使用可见回退保留。`,
  unsupportedEquation: '不支持的公式',
  unsupportedEquationFallbackName: '不支持的公式回退',
  unsupportedFallback: (tag, label) =>
    label ? `[不支持的 ${tag} 内容：${label}]` : `[不支持的 ${tag} 内容]`,
  user: '用户',
};

export const EXPORT_STRING_KEYS = Object.keys(EN).sort();

export function getExportStrings(language: ExportLanguage): ExportStrings {
  return language === 'zh-CN' ? ZH_CN : EN;
}
