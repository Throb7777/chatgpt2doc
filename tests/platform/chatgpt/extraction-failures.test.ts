import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import type { DocumentNode } from '../../../src/document/ast';
import { parseMessageContentResult } from '../../../src/platform/chatgpt/content-parser';
import {
  collectConversation,
  ConversationCollectionError,
  type ConversationViewport,
} from '../../../src/platform/chatgpt/conversation-collector';
import { discoverChatGptPage } from '../../../src/platform/chatgpt/message-discovery';

const failureHtml = readFileSync(
  new URL('../../fixtures/chatgpt/extraction-failures.html', import.meta.url),
  'utf8',
);
const richHtml = readFileSync(
  new URL('../../fixtures/chatgpt/rich-content.html', import.meta.url),
  'utf8',
);

function visibleText(nodes: DocumentNode[]): string {
  return nodes.flatMap((node) => {
    if (node.kind === 'text') return [node.value];
    if ('children' in node) return [visibleText(node.children)];
    if (node.kind === 'orderedList' || node.kind === 'unorderedList') {
      return node.items.map((item) => visibleText(item.children));
    }
    if (node.kind === 'table') {
      return [node.header, ...node.rows]
        .flatMap((row) => row.cells.map((cell) => visibleText(cell.children)));
    }
    return [];
  }).join(' ');
}

function staticViewport(html: string): ConversationViewport {
  const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/failures' });
  let position = 0;
  return {
    getExtent: () => 100,
    getPosition: () => position,
    getViewportSize: () => 100,
    readSnapshot: () => discoverChatGptPage(dom.window.document),
    scrollTo: (nextPosition) => {
      position = nextPosition;
    },
    waitForRender: async () => Promise.resolve(),
  };
}

describe('extraction failure hardening', () => {
  it('keeps the supported rich-content regression fixture warning-free', () => {
    const document = new JSDOM(richHtml).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-id="rich-message"]')!;

    expect(parseMessageContentResult(message, 'rich-message').warnings).toEqual([]);
  });

  it('preserves visible fallback text and returns typed warning provenance', () => {
    const document = new JSDOM(failureHtml).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-id="failure-message"]')!;
    const result = parseMessageContentResult(message, 'failure-message');
    const text = visibleText(result.content);

    expect(text).toContain('Visible highlighted text remains readable.');
    expect(text).toContain('Dataset caption');
    expect(text).toContain('[Image unavailable: Missing plot]');
    expect(text).toContain('[Unsupported iframe content: Interactive chart]');
    expect(text).not.toContain('privateCodeMustNotBecomeContent');
    expect(result.warnings).toEqual([
      {
        code: 'unsupported-content',
        message: 'Unsupported <mark> content was preserved with a visible fallback.',
        provenance: {
          stage: 'extraction',
          messageId: 'failure-message',
          nodePath: [0, 0, 0],
          sourceKind: 'mark',
        },
      },
      {
        code: 'unsupported-content',
        message: 'Unsupported <caption> content was preserved with a visible fallback.',
        provenance: {
          stage: 'extraction',
          messageId: 'failure-message',
          nodePath: [0, 1, 0],
          sourceKind: 'caption',
        },
      },
      {
        code: 'image-unavailable',
        message: 'An image without a usable source was preserved as visible fallback text.',
        provenance: {
          stage: 'extraction',
          messageId: 'failure-message',
          nodePath: [0, 2],
          sourceKind: 'image',
        },
      },
      {
        code: 'unsupported-content',
        message: 'Unsupported <iframe> content was preserved with a visible fallback.',
        provenance: {
          stage: 'extraction',
          messageId: 'failure-message',
          nodePath: [0, 3, 0],
          sourceKind: 'iframe',
        },
      },
    ]);
  });

  it('carries parser warnings into a deduplicated conversation result', async () => {
    const result = await collectConversation(staticViewport(failureHtml));

    expect(result.messages).toHaveLength(1);
    expect(result.warnings).toHaveLength(4);
    expect(result.warnings.every(({ provenance }) =>
      provenance.messageId === 'failure-message')).toBe(true);
  });

  it('reports semantic messages omitted because stable identity is unavailable', async () => {
    const html = [
      '<main>',
      '<article data-message-author-role="user" data-message-id="stable"><p>Stable</p></article>',
      '<article data-message-author-role="assistant"><p>Missing identity</p></article>',
      '</main>',
    ].join('');
    const result = await collectConversation(staticViewport(html));

    expect(result.messages.map(({ id }) => id)).toEqual(['stable']);
    expect(result.warnings).toContainEqual({
      code: 'incomplete-collection',
      message: 'One or more semantic messages lacked a stable identifier and were not collected.',
      provenance: { stage: 'extraction', sourceKind: 'message-identity' },
    });
  });

  it('exposes bounded collection failure as a typed incomplete warning', async () => {
    const viewport = staticViewport(failureHtml);
    viewport.getExtent = () => 1_000;

    const error = await collectConversation(viewport, { maxSnapshots: 2 })
      .then(() => null, (reason: unknown) => reason);

    expect(error).toBeInstanceOf(ConversationCollectionError);
    expect((error as ConversationCollectionError).warning).toEqual({
      code: 'incomplete-collection',
      message: 'Conversation collection did not stabilize after 2 snapshots.',
      provenance: { stage: 'extraction', sourceKind: 'conversation' },
    });
  });
});
