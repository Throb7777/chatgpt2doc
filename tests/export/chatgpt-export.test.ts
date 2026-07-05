import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import type { ConversationCollection } from '../../src/platform/chatgpt/conversation-collector';
import {
  executeChatGptExport,
  type ChatGptExportDependencies,
} from '../../src/export/chatgpt-export';
import { DownloadNameRegistry } from '../../src/downloads/browser-download';
import {
  LocalExportJobController,
  type ExportProgress,
} from '../../src/export/export-job';
import { DEFAULT_UI_SETTINGS } from '../../src/settings/settings';

function collection(messageCount = 2): ConversationCollection {
  return {
    duplicateCount: 0,
    messages: Array.from({ length: messageCount }, (_, index) => ({
      content: [{
        children: [{ kind: 'text' as const, value: `Message ${index}` }],
        kind: 'paragraph' as const,
      }],
      id: `message-${index}`,
      order: index,
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      selected: false,
      status: 'complete' as const,
    })),
    snapshotCount: 3,
    warnings: [],
  };
}

function dependencies(overrides: Partial<ChatGptExportDependencies> = {}): {
  dependencies: ChatGptExportDependencies;
  downloads: string[];
} {
  const downloads: string[] = [];
  return {
    downloads,
    dependencies: {
      collect: async (_document, options) => {
        options.onProgress?.(1, 3);
        options.onProgress?.(3, 3);
        return collection();
      },
      download: (_blob, fileName) => downloads.push(fileName),
      now: () => new Date('2026-06-23T07:01:00.000Z'),
      render: async () => ({
        blob: new Blob(['document']),
        warnings: [],
      }),
      ...overrides,
    },
  };
}

describe('ChatGPT export pipeline', () => {
  it('exports a single visible response without invoking the scroll collector', async () => {
    const dom = new JSDOM([
      '<main><h1>No Scroll Chat</h1>',
      '<article data-message-author-role="user" data-message-id="user-1">',
      '<p>USER_SHOULD_NOT_EXPORT</p>',
      '</article>',
      '<article data-message-author-role="assistant" data-message-id="assistant-1">',
      '<div class="markdown"><p>ASSISTANT_VISIBLE_EXPORT</p></div>',
      '</article></main>',
    ].join(''), { url: 'https://chatgpt.com/c/no-scroll-single' });
    let capturedRequest: unknown;
    const { dependencies: deps, downloads } = dependencies({
      collect: async () => {
        throw new Error('scroll collector should not run');
      },
      render: async (request) => {
        capturedRequest = request;
        return {
          blob: new Blob(['single']),
          warnings: [],
        };
      },
    });

    await new LocalExportJobController().run((context) => executeChatGptExport(
      dom.window.document,
      { format: 'docx', messageId: 'assistant-1', scope: 'single-response' },
      DEFAULT_UI_SETTINGS,
      context,
      undefined,
      deps,
    ));

    expect(downloads).toHaveLength(1);
    expect(capturedRequest).toMatchObject({
      document: {
        messages: [{
          id: 'assistant-1',
          order: 0,
          role: 'assistant',
        }],
      },
      selection: { messageId: 'assistant-1', scope: 'single-response' },
    });
  });

  it('normalizes renderer-boundary math and records a sanitized local trace', async () => {
    const dom = new JSDOM([
      '<main><h1>Trace Chat</h1>',
      '<article data-message-author-role="assistant" data-message-id="assistant-1">',
      '<div class="markdown"><p>Use \u03c4&nbsp;\u2208&nbsp;[0,H] locally.</p></div>',
      '</article></main>',
    ].join(''), { url: 'https://chatgpt.com/c/trace' });
    let capturedRequest: unknown;
    const { dependencies: deps } = dependencies({
      collect: async () => {
        throw new Error('scroll collector should not run');
      },
      render: async (request) => {
        capturedRequest = request;
        return {
          blob: new Blob(['trace']),
          warnings: [],
        };
      },
    });

    await new LocalExportJobController().run((context) => executeChatGptExport(
      dom.window.document,
      { format: 'docx', messageId: 'assistant-1', scope: 'single-response' },
      DEFAULT_UI_SETTINGS,
      context,
      undefined,
      deps,
    ));

    expect(capturedRequest).toMatchObject({
      document: {
        messages: [{
          content: [{
            children: [
              { kind: 'text', value: 'Use ' },
              {
                fallbackText: '\u03c4\u00a0\u2208\u00a0[0,H]',
                kind: 'mathInline',
                source: '\u03c4\u2208[0,H]',
              },
              { kind: 'text', value: ' locally.' },
            ],
            kind: 'paragraph',
          }],
        }],
      },
    });
    expect(globalThis.__CHAT_EXPORT_LAST_TRACE__).toMatchObject({
      buildFingerprint: expect.stringContaining('renderer:m16.1-chat12-14-tex-delimiters'),
      format: 'docx',
      messages: [{
        codeBlocks: [],
        mathNodes: 1,
        targetSignals: {
          tauIntervalMathCount: 1,
          tauIntervalTextLikeCount: 0,
        },
      }],
    });
  });

  it('waits for selected preformatted content to become stable before parsing it', async () => {
    const dom = new JSDOM([
      '<main><h1>Hydration Chat</h1>',
      '<article data-message-author-role="assistant" data-message-id="assistant-1">',
      '<div class="markdown"><pre><code></code></pre></div>',
      '</article></main>',
    ].join(''), { url: 'https://chatgpt.com/c/hydration' });
    let frames = 0;
    let capturedValue = '';
    const { dependencies: deps } = dependencies({
      collect: async () => {
        throw new Error('scroll collector should not run');
      },
      render: async (request) => {
        const block = request.document.messages[0]?.content[0];
        capturedValue = block?.kind === 'codeBlock' ? block.value : '';
        return { blob: new Blob(['hydrated']), warnings: [] };
      },
      waitForFrame: async () => {
        frames += 1;
        if (frames === 1) {
          const code = dom.window.document.querySelector('code');
          if (code) code.textContent = '┌──┐\n│A │\n└──┘';
        }
      },
    });

    await new LocalExportJobController().run((context) => executeChatGptExport(
      dom.window.document,
      { format: 'docx', messageId: 'assistant-1', scope: 'single-response' },
      DEFAULT_UI_SETTINGS,
      context,
      undefined,
      deps,
    ));

    expect(frames).toBe(2);
    expect(capturedValue).toBe('┌──┐\n│A │\n└──┘');
    expect(globalThis.__CHAT_EXPORT_LAST_TRACE__?.summary).toMatchObject({
      emptyPreformattedBlocks: 0,
      preformattedBlocks: 1,
    });
  });

  it('stops rather than silently exporting an unresolved empty preformatted block', async () => {
    const dom = new JSDOM([
      '<main><h1>Empty Hydration Chat</h1>',
      '<article data-message-author-role="assistant" data-message-id="assistant-1">',
      '<div class="markdown"><pre><code></code></pre></div>',
      '</article></main>',
    ].join(''), { url: 'https://chatgpt.com/c/empty-hydration' });
    const { dependencies: deps, downloads } = dependencies({
      collect: async () => {
        throw new Error('scroll collector should not run');
      },
      waitForFrame: async () => {},
    });

    await expect(new LocalExportJobController().run((context) => executeChatGptExport(
      dom.window.document,
      { format: 'docx', messageId: 'assistant-1', scope: 'single-response' },
      DEFAULT_UI_SETTINGS,
      context,
      undefined,
      deps,
    ))).rejects.toThrow('Preformatted content did not stabilize');
    expect(downloads).toEqual([]);
  });

  it('exports selected visible messages in page order without invoking the scroll collector', async () => {
    const dom = new JSDOM([
      '<main><h1>Selected Chat</h1>',
      '<article data-message-author-role="user" data-message-id="user-1"><p>A</p></article>',
      '<article data-message-author-role="assistant" data-message-id="assistant-1">',
      '<div class="markdown"><p>B</p></div></article>',
      '<article data-message-author-role="user" data-message-id="user-2"><p>C</p></article>',
      '<article data-message-author-role="assistant" data-message-id="assistant-2">',
      '<div class="markdown"><p>D</p></div></article>',
      '</main>',
    ].join(''), { url: 'https://chatgpt.com/c/no-scroll-selected' });
    let messageIds: string[] = [];
    const { dependencies: deps } = dependencies({
      collect: async () => {
        throw new Error('scroll collector should not run');
      },
      render: async (request) => {
        messageIds = request.document.messages.map(({ id }) => id);
        return {
          blob: new Blob(['selected']),
          warnings: [],
        };
      },
    });

    await new LocalExportJobController().run((context) => executeChatGptExport(
      dom.window.document,
      {
        format: 'pdf',
        messageIds: ['assistant-2', 'user-1'],
        scope: 'selected-messages',
      },
      DEFAULT_UI_SETTINGS,
      context,
      undefined,
      deps,
    ));

    expect(messageIds).toEqual(['user-1', 'assistant-2']);
  });

  it('exports recent visible messages without invoking the scroll collector', async () => {
    const dom = new JSDOM([
      '<main><h1>Recent Chat</h1>',
      '<article data-message-author-role="user" data-message-id="user-1"><p>A</p></article>',
      '<article data-message-author-role="assistant" data-message-id="assistant-1">',
      '<div class="markdown"><p>B</p></div></article>',
      '<article data-message-author-role="user" data-message-id="user-2"><p>C</p></article>',
      '<article data-message-author-role="assistant" data-message-id="assistant-2">',
      '<div class="markdown"><p>D</p></div></article>',
      '</main>',
    ].join(''), { url: 'https://chatgpt.com/c/no-scroll-recent' });
    let messageIds: string[] = [];
    let warnings = 0;
    const { dependencies: deps } = dependencies({
      collect: async () => {
        throw new Error('scroll collector should not run');
      },
      render: async (request) => {
        messageIds = request.document.messages.map(({ id }) => id);
        warnings = request.document.warnings.length;
        return {
          blob: new Blob(['recent']),
          warnings: [],
        };
      },
    });

    await new LocalExportJobController().run((context) => executeChatGptExport(
      dom.window.document,
      {
        collectionMode: 'recent',
        format: 'docx',
        recentCount: 2,
        scope: 'full-conversation',
      },
      DEFAULT_UI_SETTINGS,
      context,
      undefined,
      deps,
    ));

    expect(messageIds).toEqual(['user-2', 'assistant-2']);
    expect(warnings).toBeGreaterThan(0);
  });

  it('collects, renders, downloads once, and reports ordered stages', async () => {
    const dom = new JSDOM('<main><h1>Research Chat</h1></main>', {
      url: 'https://chatgpt.com/c/pipeline',
    });
    const { dependencies: deps, downloads } = dependencies();
    const progress: ExportProgress[] = [];
    const controller = new LocalExportJobController();
    const result = await controller.run((context) => executeChatGptExport(
      dom.window.document,
      { format: 'pdf', scope: 'full-conversation' },
      { ...DEFAULT_UI_SETTINGS, fileName: '' },
      context,
      undefined,
      deps,
    ), (value) => progress.push(value));

    expect(result.status).toBe('completed');
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(
      /^Research Chat 2026-06-23_\d{2}-\d{2}-\d{2}\.pdf$/u,
    );
    expect(progress.map(({ stage }) => stage)).toEqual([
      'collecting',
      'collecting',
      'collecting',
      'rendering',
      'rendering',
      'downloading',
      'downloading',
    ]);
    expect(globalThis.__CHAT_EXPORT_LAST_PERF__).toMatchObject({
      buildFingerprint: expect.stringContaining('renderer:m16.1-chat12-14-tex-delimiters'),
      format: 'pdf',
      messages: 2,
      nodes: 4,
      outputBytes: 8,
      title: 'Research Chat',
      warnings: 0,
    });
    expect(globalThis.__CHAT_EXPORT_LAST_PERF__?.stages.map(({ name }) => name)).toEqual([
      'collecting',
      'normalizing',
      'rendering',
      'downloading',
      'total',
    ]);
    expect(globalThis.__CHAT_EXPORT_LAST_PERF__?.stages.every(({ durationMs }) =>
      Number.isFinite(durationMs) && durationMs >= 0)).toBe(true);
  });

  it('cancels during rendering without triggering a download', async () => {
    const dom = new JSDOM('<main><h1>Cancel Chat</h1></main>', {
      url: 'https://chatgpt.com/c/cancel',
    });
    const { dependencies: deps, downloads } = dependencies({
      render: async (_request, signal) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(
          new DOMException('Cancelled', 'AbortError'),
        ));
        void resolve;
      }),
    });
    const controller = new LocalExportJobController();
    const running = controller.run((context) => executeChatGptExport(
      dom.window.document,
      { format: 'docx', scope: 'full-conversation' },
      DEFAULT_UI_SETTINGS,
      context,
      undefined,
      deps,
    ));
    await new Promise((resolve) => setTimeout(resolve, 0));

    controller.cancel();
    await expect(running).resolves.toEqual({ status: 'cancelled' });
    expect(downloads).toEqual([]);
  });

  it('rejects oversized output before download', async () => {
    const dom = new JSDOM('<main><h1>Large Chat</h1></main>', {
      url: 'https://chatgpt.com/c/large',
    });
    const { dependencies: deps, downloads } = dependencies({
      render: async () => ({
        blob: new Blob(['too large']),
        warnings: [],
      }),
    });
    const controller = new LocalExportJobController();

    await expect(controller.run((context) => executeChatGptExport(
      dom.window.document,
      { format: 'pdf', scope: 'full-conversation' },
      DEFAULT_UI_SETTINGS,
      context,
      { maxMessages: 10, maxNodes: 100, maxOutputBytes: 2 },
      deps,
    ))).rejects.toThrow('2-byte');
    expect(downloads).toEqual([]);
  });

  it('applies deterministic duplicate suffixes across repeated downloads', async () => {
    const dom = new JSDOM('<main><h1>Repeated Chat</h1></main>', {
      url: 'https://chatgpt.com/c/repeated',
    });
    const registry = new DownloadNameRegistry();
    const { dependencies: deps, downloads } = dependencies({
      reserveName: (fileName) => registry.reserve(fileName),
    });
    const run = () => new LocalExportJobController().run((context) =>
      executeChatGptExport(
        dom.window.document,
        { format: 'pdf', scope: 'full-conversation' },
        { ...DEFAULT_UI_SETTINGS, fileName: 'Report' },
        context,
        undefined,
        deps,
      ));

    await run();
    await run();

    expect(downloads).toEqual(['Report.pdf', 'Report (2).pdf']);
  });
});
