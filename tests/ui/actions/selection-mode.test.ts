import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXPORT_REQUEST_EVENT, type ExportIntent } from '../../../src/ui/actions/ActionGroup';
import { mountChatExportActions } from '../../../src/ui/actions/action-mounts';

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.unstubAllGlobals();
});

function createDom(): JSDOM {
  const dom = new JSDOM([
    '<main role="main">',
    '<article data-message-author-role="user" data-message-id="user-1"><p>Prompt</p></article>',
    '<article data-message-author-role="assistant" data-message-id="assistant-1"><p>Answer</p></article>',
    '<article data-message-author-role="assistant" data-message-id="assistant-stream" aria-busy="true"><p>Streaming</p></article>',
    '</main>',
  ].join(''), { url: 'https://chatgpt.com/c/selection' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('SVGElement', dom.window.SVGElement);
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
  return dom;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function buttonByText(document: Document, text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find(({ textContent }) => textContent === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

describe('message selection mode', () => {
  it('blocks empty export and emits selected IDs in source order', async () => {
    const dom = createDom();
    const { document } = dom.window;
    const intents: ExportIntent[] = [];
    document.addEventListener(EXPORT_REQUEST_EVENT, (event) => {
      intents.push((event as CustomEvent<ExportIntent>).detail);
    });
    cleanup = mountChatExportActions(document);
    await flush();

    buttonByText(document, 'Select messages').click();
    expect(document.querySelectorAll('[data-chat-export-selection]')).toHaveLength(3);
    expect(document.querySelector('[data-chat-export-selection-bar]')?.textContent).toContain(
      'Select at least one message to export.',
    );
    expect([...document.querySelectorAll<HTMLButtonElement>(
      '[data-chat-export-selection-format]',
    )].every(({ disabled }) => disabled)).toBe(true);
    expect(document.querySelector<HTMLInputElement>(
      '[data-chat-export-selection="assistant-stream"] input',
    )?.disabled).toBe(true);

    document.querySelector<HTMLInputElement>(
      '[data-chat-export-selection="assistant-1"] input',
    )!.click();
    document.querySelector<HTMLInputElement>(
      '[data-chat-export-selection="user-1"] input',
    )!.click();
    expect(document.querySelector('[data-chat-export-selection-bar]')?.textContent).toContain(
      '2 messages selected.',
    );

    document.querySelector<HTMLButtonElement>(
      '[data-chat-export-selection-format="docx"]',
    )!.click();
    expect(intents).toEqual([{
      format: 'docx',
      scope: 'selected-messages',
      messageIds: ['user-1', 'assistant-1'],
    }]);

    buttonByText(document, 'Cancel').click();
    expect(document.querySelectorAll('[data-chat-export-selection]')).toHaveLength(0);
    expect(document.querySelector('[data-chat-export-selection-bar]')).toBeNull();
  });

  it('resets active selection when SPA navigation changes the conversation', async () => {
    const dom = createDom();
    const { document } = dom.window;
    cleanup = mountChatExportActions(document);
    await flush();

    buttonByText(document, 'Select messages').click();
    document.querySelector<HTMLInputElement>(
      '[data-chat-export-selection="user-1"] input',
    )!.click();

    dom.reconfigure({ url: 'https://chatgpt.com/c/selection-next' });
    document.body.innerHTML = [
      '<main role="main">',
      '<article data-message-author-role="assistant" data-message-id="assistant-next">',
      '<p>Next answer</p>',
      '</article>',
      '</main>',
    ].join('');
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    await flush();

    expect(document.querySelectorAll('[data-chat-export-selection]')).toHaveLength(0);
    expect(document.querySelector('[data-chat-export-selection-bar]')).toBeNull();
    expect(buttonByText(document, 'Select messages').disabled).toBe(false);
  });
});
