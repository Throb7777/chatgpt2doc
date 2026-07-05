declare const __CHAT_EXPORT_BUILD_ID__: string | undefined;
declare const __CHAT_EXPORT_VERSION__: string | undefined;

const PRODUCT_VERSION = typeof __CHAT_EXPORT_VERSION__ === 'string'
  ? __CHAT_EXPORT_VERSION__
  : '1.0.0';

const BUILD_ID = typeof __CHAT_EXPORT_BUILD_ID__ === 'string'
  ? __CHAT_EXPORT_BUILD_ID__
  : 'local-dev';

export const EXPORT_RENDERER_VERSION = 'm16.1-chat12-14-tex-delimiters';

export function exportBuildFingerprint(): string {
  return [
    `chatgpt2doc/${PRODUCT_VERSION}`,
    `build:${BUILD_ID}`,
    `renderer:${EXPORT_RENDERER_VERSION}`,
  ].join(' ');
}
