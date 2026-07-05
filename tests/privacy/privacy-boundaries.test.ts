import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserImageEnvironment } from '../../src/assets/image-resolver';
import {
  executeChatGptExport,
  type ChatGptExportDependencies,
} from '../../src/export/chatgpt-export';
import { LocalExportJobController } from '../../src/export/export-job';
import { collectChatGptConversation } from '../../src/platform/chatgpt/conversation-collector';
import { renderStructuredDocx } from '../../src/renderers/docx/docx-node-renderer';
import { DEFAULT_UI_SETTINGS } from '../../src/settings/settings';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('privacy boundaries', () => {
  it('performs a real local DOCX export without a network or telemetry call', async () => {
    const sentinel = 'PRIVATE_CHAT_SENTINEL_M7_1';
    const dom = new JSDOM([
      '<main><h1>Private local export</h1>',
      '<article data-testid="conversation-turn-1" data-message-author-role="user"',
      ' data-message-id="privacy-user"><div class="whitespace-pre-wrap">',
      sentinel,
      '</div></article>',
      '<article data-testid="conversation-turn-2" data-message-author-role="assistant"',
      ' data-message-id="privacy-assistant"><div class="markdown prose">',
      '<p>Local response only.</p>',
      '</div></article></main>',
    ].join(''), { url: 'https://chatgpt.com/c/privacy-audit' });
    const fetchSpy = vi.fn();
    const sendBeacon = vi.fn();
    const constructorCalls: string[] = [];
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('navigator', { sendBeacon });
    for (const api of ['EventSource', 'WebSocket', 'XMLHttpRequest']) {
      vi.stubGlobal(api, class {
        constructor() {
          constructorCalls.push(api);
        }
      });
    }
    const downloads: Blob[] = [];
    const dependencies: ChatGptExportDependencies = {
      collect: (document, options) => collectChatGptConversation(document, {
        ...options,
        scrollElement: document.documentElement,
        settleMilliseconds: 0,
      }),
      download: (blob) => downloads.push(blob),
      now: () => new Date('2026-06-23T05:00:00.000Z'),
      render: (request, signal) => renderStructuredDocx(request, { signal }),
      reserveName: (fileName) => fileName,
    };

    const result = await new LocalExportJobController().run((context) =>
      executeChatGptExport(
        dom.window.document,
        { format: 'docx', scope: 'full-conversation' },
        DEFAULT_UI_SETTINGS,
        context,
        undefined,
        dependencies,
      ));

    expect(result.status).toBe('completed');
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.size).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(constructorCalls).toEqual([]);
  });

  it('retrieves an explicit image without credentials or page referrer', async () => {
    const fetchSpy = vi.fn(async () => new Response('image'));
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('createImageBitmap', vi.fn());
    const environment = createBrowserImageEnvironment();

    await environment?.fetch('https://images.example.test/chart.png');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://images.example.test/chart.png',
      {
        credentials: 'omit',
        method: 'GET',
        referrerPolicy: 'no-referrer',
      },
    );
  });
});
