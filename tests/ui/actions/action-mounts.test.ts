import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { discoverChatGptPage } from '../../../src/platform/chatgpt/message-discovery';
import {
  DEFAULT_UI_SETTINGS,
  type SettingsStorage,
  type UiSettings,
} from '../../../src/settings/settings';
import { EXPORT_REQUEST_EVENT, type ExportIntent } from '../../../src/ui/actions/ActionGroup';
import {
  mountChatExportActions,
  syncChatExportActions,
} from '../../../src/ui/actions/action-mounts';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

function installDom(dom: JSDOM): void {
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('SVGElement', dom.window.SVGElement);
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
}

function createConversation(streaming = false): JSDOM {
  return new JSDOM([
    '<main role="main">',
    '<article data-message-author-role="user" data-message-id="user-1"><p>Prompt</p></article>',
    `<article data-message-author-role="assistant" data-message-id="assistant-1"${streaming ? ' aria-busy="true"' : ''}><p>Answer</p></article>`,
    '</main>',
  ].join(''), { url: 'https://chatgpt.com/c/actions' });
}

async function flushMounts(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ChatGPT export action mounts', () => {
  it('mounts idempotent conversation and response actions with exact intents', async () => {
    const dom = createConversation();
    installDom(dom);
    const { document } = dom.window;
    const intents: ExportIntent[] = [];
    document.addEventListener(EXPORT_REQUEST_EVENT, (event) => {
      intents.push((event as CustomEvent<ExportIntent>).detail);
    });
    const cleanup = mountChatExportActions(document);
    cleanups.push(cleanup);
    await flushMounts();

    syncChatExportActions(document, discoverChatGptPage(document));
    expect(document.querySelectorAll('[data-chat-export-actions="conversation"]')).toHaveLength(1);
    expect(document.querySelector('[data-chat-export-floating-panel]')?.parentElement)
      .toBe(document.body);
    expect(document.querySelector('main > [data-chat-export-actions="conversation"]')).toBeNull();
    expect(document.querySelectorAll('[data-chat-export-actions="response"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-chat-export-format]')).toHaveLength(4);
    expect(document.querySelectorAll('.chat-export-format-icon')).toHaveLength(4);
    expect(document.querySelectorAll('.chat-export-format-icon-shell')).toHaveLength(0);
    expect(document.querySelectorAll('.chat-export-format-icon-spine')).toHaveLength(0);
    expect(document.querySelectorAll('.chat-export-format-icon-page')).toHaveLength(4);
    expect(document.querySelectorAll('.chat-export-format-icon-fold')).toHaveLength(4);
    expect(document.querySelectorAll('.chat-export-format-icon-word-tile')).toHaveLength(0);
    expect(document.querySelectorAll('.chat-export-format-icon-page--outline')).toHaveLength(2);
    expect(document.querySelectorAll('.chat-export-format-icon-page--filled')).toHaveLength(2);
    expect(document.querySelectorAll('[data-chat-export-icon="docx"] .chat-export-format-icon-mark--docx'))
      .toHaveLength(2);
    expect(document.querySelectorAll('[data-chat-export-icon="pdf"] .chat-export-format-icon-mark--pdf'))
      .toHaveLength(2);
    expect([...document.querySelectorAll('[data-chat-export-icon="docx"] text')]
      .every(({ textContent }) => textContent?.trim() === 'W')).toBe(true);
    expect([...document.querySelectorAll('[data-chat-export-icon="pdf"] text')]
      .every(({ textContent }) => textContent?.trim() === 'PDF')).toBe(true);
    expect(document.querySelectorAll('.chat-export-format-badge')).toHaveLength(0);
    expect(document.querySelectorAll('[data-chat-export-floating-panel] .chat-export-sr-only'))
      .toHaveLength(2);
    expect(document.querySelector('[data-chat-export-floating-panel] .chat-export-floating-title'))
      .toBeNull();
    expect(document.querySelector('[data-chat-export-floating-panel] .chat-export-panel-drag-handle.chat-export-action-button'))
      .toBeNull();

    document.querySelector<HTMLButtonElement>(
      '[data-chat-export-actions="response"] [data-chat-export-format="docx"]',
    )!.click();
    document.querySelector<HTMLButtonElement>(
      '[data-chat-export-actions="conversation"] [data-chat-export-format="pdf"]',
    )!.click();

    expect(intents).toEqual([
      { format: 'docx', scope: 'single-response', messageId: 'assistant-1' },
      { collectionMode: 'visible-only', format: 'pdf', scope: 'full-conversation' },
    ]);
  });

  it('disables actions during streaming and enables regenerated content', async () => {
    const dom = createConversation(true);
    installDom(dom);
    const { document } = dom.window;
    const cleanup = mountChatExportActions(document);
    cleanups.push(cleanup);
    await flushMounts();

    expect([...document.querySelectorAll<HTMLButtonElement>('[data-chat-export-format]')]
      .every(({ disabled }) => disabled)).toBe(true);
    expect([...document.querySelectorAll<HTMLButtonElement>('button')]
      .find(({ textContent }) => textContent === 'Select messages')?.disabled).toBe(false);

    document.querySelector('[data-message-id="assistant-1"]')!.outerHTML = [
      '<article data-message-author-role="assistant" data-message-id="assistant-1">',
      '<p>Regenerated answer</p>',
      '</article>',
    ].join('');
    await flushMounts();

    const responseMounts = document.querySelectorAll('[data-chat-export-actions="response"]');
    expect(responseMounts).toHaveLength(1);
    expect([...document.querySelectorAll<HTMLButtonElement>('[data-chat-export-format]')]
      .every(({ disabled }) => !disabled)).toBe(true);
  });

  it('remounts across SPA replacement, inherits theme state, and cleans up', async () => {
    const dom = createConversation();
    installDom(dom);
    const { document } = dom.window;
    document.documentElement.dataset.theme = 'dark';
    const cleanup = mountChatExportActions(document);
    cleanups.push(cleanup);
    await flushMounts();

    dom.reconfigure({ url: 'https://chatgpt.com/c/next' });
    document.body.innerHTML = [
      '<main role="main">',
      '<article data-message-author-role="assistant" data-message-id="assistant-next">',
      '<p>Next conversation</p>',
      '</article>',
      '</main>',
    ].join('');
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    await flushMounts();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelectorAll('[data-chat-export-actions]')).toHaveLength(2);
    expect(document.querySelector('[data-chat-export-message-id="assistant-next"]')).not.toBeNull();
    expect(document.querySelector('[data-chat-export-message-id="assistant-1"]')).toBeNull();

    cleanup();
    cleanups.pop();
    expect(document.querySelectorAll('[data-chat-export-actions]')).toHaveLength(0);
  });

  it('persists one final panel position after a multi-event mouse drag', async () => {
    const dom = createConversation();
    installDom(dom);
    Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1000 });
    const saved: UiSettings[] = [];
    const save = vi.fn(async (settings: UiSettings) => {
      saved.push(settings);
    });
    const storage: SettingsStorage = {
      load: async () => ({ ...DEFAULT_UI_SETTINGS }),
      reset: async () => ({ ...DEFAULT_UI_SETTINGS }),
      save,
    };
    const cleanup = mountChatExportActions(dom.window.document, { settingsStorage: storage });
    cleanups.push(cleanup);
    await flushMounts();

    const panel = dom.window.document.querySelector<HTMLElement>(
      '[data-chat-export-floating-panel] .chat-export-floating-panel',
    )!;
    const handle = panel.querySelector<HTMLButtonElement>('.chat-export-panel-drag-handle')!;
    panel.getBoundingClientRect = () => {
      const left = Number.parseFloat(panel.style.left) || 100;
      const top = Number.parseFloat(panel.style.top) || 120;
      return {
        bottom: top + 40,
        height: 40,
        left,
        right: left + 160,
        toJSON: () => ({}),
        top,
        width: 160,
        x: left,
        y: top,
      };
    };

    handle.dispatchEvent(new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: 110,
      clientY: 130,
    }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('mousemove', {
      bubbles: true,
      clientX: 150,
      clientY: 160,
    }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('mousemove', {
      bubbles: true,
      clientX: 190,
      clientY: 190,
    }));

    expect(save).not.toHaveBeenCalled();

    dom.window.document.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
    await flushMounts();

    expect(save).toHaveBeenCalledTimes(1);
    expect(saved[0]?.panelPosition).toEqual({ x: 180, y: 180 });
  });
});
