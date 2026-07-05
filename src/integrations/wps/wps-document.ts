import type { ChatDocument } from '../../document/ast';
import type { ExportRequest } from '../../document/export';
import { getExportStrings } from '../../localization/strings';
import { parseBlocks } from '../../platform/chatgpt/content-parser';
import { renderStructuredDocxBlob } from '../../renderers/docx/docx-node-renderer';
import type { UiSettings } from '../../settings/settings';
import type { WordClipboardPayload } from '../../clipboard/word-clipboard';

const MAX_WPS_DOCX_BYTES = 16 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const chunks: string[] = [];
  let chunk = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset] ?? 0;
    const second = bytes[offset + 1] ?? 0;
    const third = bytes[offset + 2] ?? 0;
    const value = first << 16 | second << 8 | third;
    chunk += alphabet[(value >> 18) & 63];
    chunk += alphabet[(value >> 12) & 63];
    chunk += offset + 1 < bytes.length ? alphabet[(value >> 6) & 63] : '=';
    chunk += offset + 2 < bytes.length ? alphabet[value & 63] : '=';
    if (chunk.length >= 0x8000) {
      chunks.push(chunk);
      chunk = '';
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks.join('');
}

export async function createWpsClipboardDocument(
  document: Document,
  payload: WordClipboardPayload,
  settings: UiSettings,
): Promise<string> {
  const startMarker = '<!--StartFragment-->';
  const endMarker = '<!--EndFragment-->';
  const start = payload.html.indexOf(startMarker);
  const end = payload.html.lastIndexOf(endMarker);
  const fragmentHtml = start >= 0 && end > start
    ? payload.html.slice(start + startMarker.length, end)
    : payload.html;
  const container = document.createElement('div');
  container.innerHTML = fragmentHtml;
  const content = parseBlocks(container, getExportStrings(settings.language));
  if (content.length === 0) throw new Error('The selected content is empty.');

  const timestamp = new Date().toISOString();
  const messageId = 'wps-clipboard-selection';
  const chatDocument: ChatDocument = {
    version: 1,
    title: 'WPS clipboard selection',
    source: {
      platform: 'chatgpt',
      url: document.location?.href ?? 'https://chatgpt.com/',
      capturedAt: timestamp,
    },
    exportedAt: timestamp,
    messages: [{
      id: messageId,
      role: 'assistant',
      order: 0,
      selected: true,
      status: 'complete',
      content,
    }],
    warnings: [],
  };
  const request: ExportRequest = {
    document: chatDocument,
    selection: { scope: 'single-response', messageId },
    options: {
      codeStyle: settings.codeStyle,
      fileName: 'wps-clipboard-selection',
      format: 'docx',
      includePrompts: false,
      language: settings.language,
      paper: settings.paper,
      theme: settings.theme,
    },
  };
  const blob = await renderStructuredDocxBlob(request, { profile: 'wps-clipboard' });
  if (blob.size > MAX_WPS_DOCX_BYTES) {
    throw new Error('The WPS clipboard package is too large.');
  }
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}
