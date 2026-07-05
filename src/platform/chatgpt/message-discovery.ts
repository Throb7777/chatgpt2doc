import type { MessageRole } from '../../document/ast';
import {
  CHATGPT_ATTRIBUTES,
  CHATGPT_SELECTORS,
  CHATGPT_TEST_ID_PREFIX,
} from './selectors';

export interface DiscoveredChatMessage {
  id: string;
  role: MessageRole;
  order: number;
  status: 'complete' | 'streaming';
  element: HTMLElement;
}

export interface ChatGptCapabilities {
  semanticMessages: boolean;
  stableMessageIds: boolean;
  streamingSignals: boolean;
}

export interface ChatGptPageSnapshot {
  url: string;
  messages: DiscoveredChatMessage[];
  capabilities: ChatGptCapabilities;
}

const discoveredElementIds = new WeakMap<HTMLElement, number>();
let nextDiscoveredElementId = 1;

function discoveredElementId(element: HTMLElement): number {
  const existing = discoveredElementIds.get(element);
  if (existing) return existing;
  const id = nextDiscoveredElementId;
  nextDiscoveredElementId += 1;
  discoveredElementIds.set(element, id);
  return id;
}

function readRole(element: HTMLElement): MessageRole | null {
  const role = element.getAttribute(CHATGPT_ATTRIBUTES.role);
  return role === 'user' || role === 'assistant' ? role : null;
}

function readStableId(element: HTMLElement): string | null {
  const messageId = element.getAttribute(CHATGPT_ATTRIBUTES.messageId)?.trim();
  if (messageId) return messageId;

  const testId = element.getAttribute(CHATGPT_ATTRIBUTES.testId)?.trim();
  return testId?.startsWith(CHATGPT_TEST_ID_PREFIX) ? testId : null;
}

function isVisibleMessage(element: HTMLElement): boolean {
  return element.closest(CHATGPT_SELECTORS.hidden) === null;
}

function isStreaming(element: HTMLElement): boolean {
  return element.matches(CHATGPT_SELECTORS.streaming)
    || element.querySelector(CHATGPT_SELECTORS.streaming) !== null;
}

export function discoverChatGptPage(doc: Document): ChatGptPageSnapshot {
  const semanticElements = [
    ...doc.querySelectorAll<HTMLElement>(CHATGPT_SELECTORS.message),
  ].filter((element) => readRole(element) !== null && isVisibleMessage(element));

  const messages = semanticElements.flatMap((element) => {
    const id = readStableId(element);
    const role = readRole(element);
    if (!id || !role) return [];

    return [{
      id,
      role,
      order: 0,
      status: isStreaming(element) ? 'streaming' as const : 'complete' as const,
      element,
    }];
  });

  messages.forEach((message, order) => {
    message.order = order;
  });

  return {
    url: doc.location.href,
    messages,
    capabilities: {
      semanticMessages: semanticElements.length > 0,
      stableMessageIds:
        semanticElements.length > 0 && messages.length === semanticElements.length,
      streamingSignals: semanticElements.some(isStreaming),
    },
  };
}

function snapshotSignature(snapshot: ChatGptPageSnapshot): string {
  return JSON.stringify({
    url: snapshot.url,
    messages: snapshot.messages.map(({ element, id, order, role, status }) => ({
      elementId: discoveredElementId(element),
      id,
      order,
      role,
      status,
    })),
    capabilities: snapshot.capabilities,
  });
}

function extensionOwnedNode(node: Node): boolean {
  const view = node.ownerDocument?.defaultView;
  if (!view) return false;
  const element = node instanceof view.Element ? node : node.parentElement;
  return element?.closest(CHATGPT_SELECTORS.extensionUi) !== null;
}

function extensionOwnedMutation(mutation: MutationRecord): boolean {
  if (mutation.type === 'attributes') return extensionOwnedNode(mutation.target);
  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
  return changedNodes.length > 0 && changedNodes.every(extensionOwnedNode);
}

const DISCOVERY_ATTRIBUTE_FILTER = [
  CHATGPT_ATTRIBUTES.messageId,
  CHATGPT_ATTRIBUTES.role,
  CHATGPT_ATTRIBUTES.testId,
  'aria-busy',
  'aria-hidden',
  'data-is-streaming',
  'data-message-streaming',
  'hidden',
] as const;

function elementMatchesOrContains(node: Node, selector: string): boolean {
  const view = node.ownerDocument?.defaultView;
  if (!view || !(node instanceof view.Element)) return false;
  return node.matches(selector) || node.querySelector(selector) !== null;
}

function mutationAffectsDiscovery(mutation: MutationRecord): boolean {
  const view = mutation.target.ownerDocument?.defaultView;
  if (!view || !(mutation.target instanceof view.Element)) return false;
  if (mutation.type === 'attributes') {
    if (mutation.attributeName === CHATGPT_ATTRIBUTES.role) return true;
    if (mutation.attributeName === CHATGPT_ATTRIBUTES.messageId
      || mutation.attributeName === CHATGPT_ATTRIBUTES.testId) {
      return mutation.target.matches(CHATGPT_SELECTORS.message);
    }
    if (mutation.attributeName === 'aria-hidden' || mutation.attributeName === 'hidden') {
      return mutation.target.closest(CHATGPT_SELECTORS.message) !== null
        || mutation.target.querySelector(CHATGPT_SELECTORS.message) !== null;
    }
    return mutation.target.closest(CHATGPT_SELECTORS.message) !== null;
  }

  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
  return changedNodes.some((node) =>
    elementMatchesOrContains(node, CHATGPT_SELECTORS.message)
    || elementMatchesOrContains(node, CHATGPT_SELECTORS.streaming));
}

export function observeChatGptPage(
  doc: Document,
  onChange: (snapshot: ChatGptPageSnapshot) => void,
): () => void {
  const view = doc.defaultView;
  if (!view) throw new Error('ChatGPT discovery requires a document with a window.');

  let active = true;
  let previousSignature = '';
  let queued = false;
  const emit = () => {
    queued = false;
    if (!active) return;
    const snapshot = discoverChatGptPage(doc);
    const signature = snapshotSignature(snapshot);
    if (signature === previousSignature) return;
    previousSignature = signature;
    onChange(snapshot);
  };
  const queueEmit = () => {
    if (queued) return;
    queued = true;
    view.queueMicrotask(emit);
  };

  const observer = new view.MutationObserver((mutations) => {
    if (mutations.some((mutation) =>
      !extensionOwnedMutation(mutation) && mutationAffectsDiscovery(mutation))) {
      queueEmit();
    }
  });
  observer.observe(doc.documentElement, {
    attributeFilter: [...DISCOVERY_ATTRIBUTE_FILTER],
    attributes: true,
    childList: true,
    subtree: true,
  });
  view.addEventListener('hashchange', queueEmit);
  view.addEventListener('popstate', queueEmit);
  queueEmit();

  return () => {
    active = false;
    observer.disconnect();
    view.removeEventListener('hashchange', queueEmit);
    view.removeEventListener('popstate', queueEmit);
  };
}
