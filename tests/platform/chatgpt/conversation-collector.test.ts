import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import {
  collectConversation,
  createDomConversationViewport,
  type ConversationViewport,
} from '../../../src/platform/chatgpt/conversation-collector';
import { discoverChatGptPage } from '../../../src/platform/chatgpt/message-discovery';

interface Page {
  ids: number[];
  position: number;
}

class VirtualConversationViewport implements ConversationViewport {
  readonly dom = new JSDOM('<main></main>', {
    url: 'https://chatgpt.com/c/long-synthetic',
  });

  readonly pages: Page[] = Array.from({ length: 8 }, (_, pageIndex) => ({
    ids: Array.from(
      { length: 12 },
      (_, offset) => Math.min(67, pageIndex * 8 + offset),
    ).filter((id, index, ids) => ids.indexOf(id) === index),
    position: pageIndex * 80,
  }));

  extent = 580;
  position = 230;
  restorePosition: number | null = null;
  private expanded = false;

  getExtent(): number {
    return this.extent;
  }

  getPosition(): number {
    return this.position;
  }

  getViewportSize(): number {
    return 100;
  }

  readSnapshot() {
    return discoverChatGptPage(this.dom.window.document);
  }

  scrollTo(position: number): void {
    this.position = position;
    if (position === 230) this.restorePosition = position;
    const page = this.pages.reduce((closest, candidate) =>
      Math.abs(candidate.position - position) < Math.abs(closest.position - position)
        ? candidate
        : closest);
    this.dom.window.document.body.innerHTML = [
      '<main>',
      ...page.ids.map((id) => [
        `<article data-message-author-role="${id % 2 === 0 ? 'user' : 'assistant'}" data-message-id="message-${id}">`,
        `<p>Message ${id}</p>`,
        '</article>',
      ].join('')),
      '</main>',
    ].join('');
  }

  async waitForRender(): Promise<void> {
    if (this.position === 480 && !this.expanded) {
      this.expanded = true;
      this.extent = 660;
    }
    await Promise.resolve();
  }
}

describe('long conversation collector', () => {
  it('collects dynamically extended virtual windows in stable deduplicated order', async () => {
    const viewport = new VirtualConversationViewport();
    const result = await collectConversation(viewport);

    expect(result.messages).toHaveLength(68);
    expect(result.messages.map(({ id }) => id)).toEqual(
      Array.from({ length: 68 }, (_, index) => `message-${index}`),
    );
    expect(result.messages.map(({ order }) => order)).toEqual(
      Array.from({ length: 68 }, (_, index) => index),
    );
    expect(result.messages[37]).toMatchObject({
      id: 'message-37',
      role: 'assistant',
      status: 'complete',
      content: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'Message 37' }] }],
    });
    expect(result.duplicateCount).toBeGreaterThan(0);
    expect(result.snapshotCount).toBeLessThan(20);
    expect(viewport.restorePosition).toBe(230);
    expect(viewport.getPosition()).toBe(230);
  });

  it('restores the original position when collection cannot stabilize', async () => {
    const viewport = new VirtualConversationViewport();

    await expect(collectConversation(viewport, { maxSnapshots: 2 })).rejects.toThrow(
      'Conversation collection did not stabilize after 2 snapshots.',
    );
    expect(viewport.getPosition()).toBe(230);
  });

  it('treats a subpixel-clamped scroll position as the bottom', async () => {
    const dom = new JSDOM(
      '<main><article data-message-author-role="assistant" data-message-id="clamped">A</article></main>',
      { url: 'https://chatgpt.com/c/clamped' },
    );
    let position = 0;
    const viewport: ConversationViewport = {
      getExtent: () => 194,
      getPosition: () => position,
      getViewportSize: () => 100,
      readSnapshot: () => discoverChatGptPage(dom.window.document),
      scrollTo: (next) => {
        position = Math.min(next, 93.2);
      },
      waitForRender: async () => {},
    };

    const result = await collectConversation(viewport);

    expect(result.messages.map(({ id }) => id)).toEqual(['clamped']);
    expect(result.snapshotCount).toBe(4);
  });

  it('adapts a real DOM scroll container without changing selector ownership', async () => {
    const dom = new JSDOM([
      '<main id="scroll">',
      '<article data-message-author-role="assistant" data-message-id="only-message">',
      '<p>Only message</p>',
      '</article>',
      '</main>',
    ].join(''), { url: 'https://chatgpt.com/c/dom' });
    const scrollElement = dom.window.document.querySelector<HTMLElement>('#scroll')!;
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
    });
    scrollElement.scrollTop = 42;
    const viewport = createDomConversationViewport(dom.window.document, scrollElement, 0);

    const result = await collectConversation(viewport);

    expect(result.messages.map(({ id }) => id)).toEqual(['only-message']);
    expect(scrollElement.scrollTop).toBe(42);
  });

  it('detects the scrollable ChatGPT conversation container', async () => {
    const dom = new JSDOM([
      '<main id="scroll" style="overflow-y: auto">',
      '<article data-message-author-role="assistant" data-message-id="detected-message">',
      '<p>Detected message</p>',
      '</article>',
      '</main>',
    ].join(''), { url: 'https://chatgpt.com/c/detected-scroll' });
    const scrollElement = dom.window.document.querySelector<HTMLElement>('#scroll')!;
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
    });
    scrollElement.scrollTop = 23;
    const viewport = createDomConversationViewport(dom.window.document, undefined, 0);

    const result = await collectConversation(viewport);

    expect(result.messages.map(({ id }) => id)).toEqual(['detected-message']);
    expect(scrollElement.scrollTop).toBe(23);
  });

  it('uses window scrolling for the document scrolling element and restores position', async () => {
    const dom = new JSDOM([
      '<main>',
      '<article data-message-author-role="assistant" data-message-id="document-message">',
      '<p>Document message</p>',
      '</article>',
      '</main>',
    ].join(''), { url: 'https://chatgpt.com/c/document-scroll' });
    const { document } = dom.window;
    let scrollY = 7;
    Object.defineProperties(document, {
      scrollingElement: { configurable: true, value: document.documentElement },
    });
    Object.defineProperties(document.body, {
      scrollHeight: { configurable: true, value: 110 },
    });
    Object.defineProperties(dom.window, {
      innerHeight: { configurable: true, value: 100 },
      scrollY: { configurable: true, get: () => scrollY },
      scrollTo: {
        configurable: true,
        value: (_x: number, y: number) => {
          scrollY = y;
        },
      },
    });
    const viewport = createDomConversationViewport(document, undefined, 0);

    const result = await collectConversation(viewport);

    expect(result.messages.map(({ id }) => id)).toEqual(['document-message']);
    expect(scrollY).toBe(7);
  });
});
