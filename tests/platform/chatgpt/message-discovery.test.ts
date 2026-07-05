import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import {
  discoverChatGptPage,
  observeChatGptPage,
} from '../../../src/platform/chatgpt/message-discovery';

const referenceHtml = readFileSync(
  new URL('../../fixtures/reference/synthetic-conversation.html', import.meta.url),
  'utf8',
);
const stateHtml = readFileSync(
  new URL('../../fixtures/chatgpt/message-states.html', import.meta.url),
  'utf8',
);

async function flushMutations(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ChatGPT message discovery', () => {
  it('discovers semantic fixture messages in stable source order', () => {
    const dom = new JSDOM(referenceHtml, { url: 'https://chatgpt.com/c/reference' });
    const snapshot = discoverChatGptPage(dom.window.document);

    expect(snapshot.url).toBe('https://chatgpt.com/c/reference');
    expect(snapshot.messages.map(({ id, order, role, status }) => ({
      id,
      order,
      role,
      status,
    }))).toEqual([
      { id: 'fixture-user-1', order: 0, role: 'user', status: 'complete' },
      { id: 'fixture-assistant-1', order: 1, role: 'assistant', status: 'complete' },
    ]);
    expect(snapshot.capabilities).toEqual({
      semanticMessages: true,
      stableMessageIds: true,
      streamingSignals: false,
    });
  });

  it('supports stable test IDs and streaming signals while ignoring unsupported states', () => {
    const dom = new JSDOM(stateHtml, { url: 'https://chatgpt.com/c/states' });
    const snapshot = discoverChatGptPage(dom.window.document);

    expect(snapshot.messages.map(({ id, order, role, status }) => ({
      id,
      order,
      role,
      status,
    }))).toEqual([
      { id: 'message-user-1', order: 0, role: 'user', status: 'complete' },
      { id: 'conversation-turn-2', order: 1, role: 'assistant', status: 'streaming' },
    ]);
    expect(snapshot.capabilities).toEqual({
      semanticMessages: true,
      stableMessageIds: false,
      streamingSignals: true,
    });
  });

  it('emits deduplicated snapshots after SPA-like URL and DOM replacement', async () => {
    const dom = new JSDOM(
      '<main><article data-message-author-role="user" data-message-id="route-a">A</article></main>',
      { url: 'https://chatgpt.com/c/route-a' },
    );
    const onChange = vi.fn();
    const stop = observeChatGptPage(dom.window.document, onChange);

    await flushMutations();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].messages[0]?.id).toBe('route-a');

    dom.reconfigure({ url: 'https://chatgpt.com/c/route-b' });
    dom.window.document.body.innerHTML = [
      '<main>',
      '<article data-message-author-role="assistant" data-message-id="route-b" aria-busy="true">B</article>',
      '</main>',
    ].join('');
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    await flushMutations();

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1]?.[0].url).toBe('https://chatgpt.com/c/route-b');
    expect(onChange.mock.calls[1]?.[0].messages).toMatchObject([
      { id: 'route-b', order: 0, role: 'assistant', status: 'streaming' },
    ]);

    dom.window.document.body.textContent = 'queued before stop';
    stop();
    await flushMutations();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('ignores extension-owned UI mutations while observing real message changes', async () => {
    const dom = new JSDOM(
      '<main><article data-message-author-role="user" data-message-id="user-1">A</article></main>',
      { url: 'https://chatgpt.com/c/owned-ui' },
    );
    const onChange = vi.fn();
    const stop = observeChatGptPage(dom.window.document, onChange);
    await flushMutations();

    const progress = dom.window.document.createElement('div');
    progress.dataset.chatExportProgressMount = 'true';
    progress.textContent = 'Collecting';
    dom.window.document.body.append(progress);
    await flushMutations();
    progress.textContent = 'Rendering';
    await flushMutations();

    expect(onChange).toHaveBeenCalledTimes(1);

    const message = dom.window.document.createElement('article');
    message.dataset.messageAuthorRole = 'assistant';
    message.dataset.messageId = 'assistant-1';
    message.textContent = 'B';
    dom.window.document.querySelector('main')?.append(message);
    await flushMutations();

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1]?.[0].messages.map(({ id }: { id: string }) => id))
      .toEqual(['user-1', 'assistant-1']);
    stop();
  });

  it('ignores stable message content churn but observes discovery-relevant state', async () => {
    const dom = new JSDOM(
      '<main><article data-message-author-role="assistant" data-message-id="assistant-1"><p>Initial</p></article></main>',
      { url: 'https://chatgpt.com/c/relevant-mutations' },
    );
    const onChange = vi.fn();
    const stop = observeChatGptPage(dom.window.document, onChange);
    await flushMutations();

    dom.window.document.querySelector('p')!.textContent = 'Streaming text update';
    await flushMutations();
    expect(onChange).toHaveBeenCalledTimes(1);

    const streaming = dom.window.document.createElement('span');
    streaming.dataset.isStreaming = 'true';
    dom.window.document.querySelector('[data-message-id="assistant-1"]')!.append(streaming);
    await flushMutations();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1]?.[0].messages[0]?.status).toBe('streaming');

    streaming.remove();
    await flushMutations();
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange.mock.calls[2]?.[0].messages[0]?.status).toBe('complete');

    dom.window.document.querySelector('main')!.setAttribute('aria-hidden', 'true');
    await flushMutations();
    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onChange.mock.calls[3]?.[0].messages).toEqual([]);

    dom.window.document.querySelector('main')!.removeAttribute('aria-hidden');
    await flushMutations();
    expect(onChange).toHaveBeenCalledTimes(5);

    dom.window.document.querySelector('[data-message-id="assistant-1"]')!
      .removeAttribute('data-message-author-role');
    await flushMutations();
    expect(onChange).toHaveBeenCalledTimes(6);
    expect(onChange.mock.calls[5]?.[0].messages).toEqual([]);
    stop();
  });
});
