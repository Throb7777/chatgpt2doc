import type { ChatMessage, DocumentWarning } from '../../document/ast';
import type { ExportLanguage } from '../../document/export';
import { getExportStrings } from '../../localization/strings';
import { parseMessageContentResult } from './content-parser';
import {
  discoverChatGptPage,
  type ChatGptPageSnapshot,
} from './message-discovery';
import { CHATGPT_SELECTORS } from './selectors';

export interface ConversationViewport {
  getExtent(): number;
  getPosition(): number;
  getViewportSize(): number;
  readSnapshot(): ChatGptPageSnapshot;
  scrollTo(position: number): void;
  waitForRender(): Promise<void>;
}

export interface ConversationCollection {
  duplicateCount: number;
  messages: ChatMessage[];
  snapshotCount: number;
  warnings: DocumentWarning[];
}

export interface CollectionOptions {
  language?: ExportLanguage;
  maxMessages?: number;
  maxSnapshots?: number;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
  stepRatio?: number;
}

export class ConversationCollectionError extends Error {
  readonly warning: DocumentWarning;

  constructor(message: string) {
    super(message);
    this.name = 'ConversationCollectionError';
    this.warning = {
      code: 'incomplete-collection',
      message,
      provenance: { stage: 'extraction', sourceKind: 'conversation' },
    };
  }
}

export function mergeMessageOrder(current: string[], incoming: string[]): string[] {
  const merged = [...current];
  let cursor = -1;

  incoming.forEach((id, index) => {
    const existingIndex = merged.indexOf(id);
    if (existingIndex >= 0) {
      cursor = existingIndex;
      return;
    }

    if (cursor >= 0) {
      cursor += 1;
      merged.splice(cursor, 0, id);
      return;
    }

    const nextKnownId = incoming
      .slice(index + 1)
      .find((candidate) => merged.includes(candidate));
    if (nextKnownId) {
      cursor = merged.indexOf(nextKnownId);
      merged.splice(cursor, 0, id);
    } else {
      merged.push(id);
      cursor = merged.length - 1;
    }
  });

  return merged;
}

function snapshotKey(snapshot: ChatGptPageSnapshot, extent: number): string {
  return JSON.stringify({
    extent,
    messages: snapshot.messages.map(({ id, status }) => ({ id, status })),
  });
}

export async function collectConversation(
  viewport: ConversationViewport,
  options: CollectionOptions = {},
): Promise<ConversationCollection> {
  const maxSnapshots = options.maxSnapshots ?? 250;
  const maxMessages = options.maxMessages ?? 2_000;
  const stepRatio = options.stepRatio ?? 0.8;
  const strings = getExportStrings(options.language ?? 'en');
  if (!Number.isInteger(maxSnapshots) || maxSnapshots < 2) {
    throw new Error('maxSnapshots must be an integer of at least 2.');
  }
  if (!(stepRatio > 0 && stepRatio <= 1)) {
    throw new Error('stepRatio must be greater than 0 and at most 1.');
  }

  const originalPosition = viewport.getPosition();
  const records = new Map<string, ChatMessage>();
  const warningRecords = new Map<string, DocumentWarning>();
  let orderedIds: string[] = [];
  let duplicateCount = 0;
  let snapshotCount = 0;
  let previousBottomKey = '';

  try {
    options.signal?.throwIfAborted();
    viewport.scrollTo(0);
    await viewport.waitForRender();

    while (snapshotCount < maxSnapshots) {
      options.signal?.throwIfAborted();
      const snapshot = viewport.readSnapshot();
      snapshotCount += 1;
      options.onProgress?.(snapshotCount, maxSnapshots);
      const incomingIds = snapshot.messages.map(({ id }) => id);
      orderedIds = mergeMessageOrder(orderedIds, incomingIds);

      if (snapshot.capabilities.semanticMessages && !snapshot.capabilities.stableMessageIds) {
        const warning: DocumentWarning = {
          code: 'incomplete-collection',
          message: strings.stableMessageIdWarning,
          provenance: { stage: 'extraction', sourceKind: 'message-identity' },
        };
        warningRecords.set(JSON.stringify(warning), warning);
      }

      for (const message of snapshot.messages) {
        const parsed = parseMessageContentResult(
          message.element,
          message.id,
          options.language,
        );
        for (const warning of parsed.warnings) {
          warningRecords.set(JSON.stringify(warning), warning);
        }
        if (records.has(message.id)) duplicateCount += 1;
        records.set(message.id, {
          id: message.id,
          role: message.role,
          order: 0,
          selected: false,
          status: message.status,
          content: parsed.content,
        });
        if (records.size > maxMessages) {
          throw new ConversationCollectionError(
            `Conversation exceeds the ${maxMessages}-message local limit.`,
          );
        }
      }

      const extent = Math.max(0, viewport.getExtent());
      const viewportSize = Math.max(1, viewport.getViewportSize());
      const maxPosition = Math.max(0, extent - viewportSize);
      const position = Math.max(0, viewport.getPosition());
      const atBottom = position >= Math.max(0, maxPosition - 1);
      const currentBottomKey = atBottom ? snapshotKey(snapshot, extent) : '';

      if (atBottom && currentBottomKey === previousBottomKey) {
        return {
          duplicateCount,
          snapshotCount,
          messages: orderedIds.map((id, order) => ({ ...records.get(id)!, order })),
          warnings: [...warningRecords.values()],
        };
      }
      previousBottomKey = currentBottomKey;

      const step = Math.max(1, Math.floor(viewportSize * stepRatio));
      viewport.scrollTo(atBottom ? maxPosition : Math.min(maxPosition, position + step));
      await viewport.waitForRender();
      options.signal?.throwIfAborted();
    }

    throw new ConversationCollectionError(
      strings.collectionDidNotStabilize(maxSnapshots),
    );
  } finally {
    viewport.scrollTo(originalPosition);
    await viewport.waitForRender();
  }
}

export function createDomConversationViewport(
  doc: Document,
  scrollElement?: HTMLElement,
  settleMilliseconds = 50,
): ConversationViewport {
  const view = doc.defaultView;
  if (!view) throw new Error('Conversation collection requires a document with a window.');

  let detectedScrollElement: HTMLElement | null = null;
  if (!scrollElement) {
    let current = doc.querySelector<HTMLElement>(CHATGPT_SELECTORS.conversationRoot);
    while (current && current !== doc.body) {
      const style = view.getComputedStyle(current);
      const overflowY = `${style.overflowY} ${style.overflow} ${current.style.overflowY}`;
      if (
        /\b(?:auto|scroll)\b/u.test(overflowY)
        && current.scrollHeight > current.clientHeight
      ) {
        detectedScrollElement = current;
        break;
      }
      current = current.parentElement;
    }
  }
  const candidate = scrollElement ?? detectedScrollElement ?? doc.scrollingElement;
  if (!(candidate instanceof view.HTMLElement)) {
    throw new Error('A valid HTML scroll container is required.');
  }
  const documentScroller = candidate === doc.scrollingElement;

  return {
    getExtent: () => documentScroller
      ? Math.max(view.innerHeight, doc.body?.scrollHeight ?? 0)
      : candidate.scrollHeight,
    getPosition: () => documentScroller
      ? Math.max(view.scrollY, candidate.scrollTop, doc.body?.scrollTop ?? 0)
      : candidate.scrollTop,
    getViewportSize: () => documentScroller ? view.innerHeight : candidate.clientHeight,
    readSnapshot: () => discoverChatGptPage(doc),
    scrollTo: (position) => {
      if (documentScroller) {
        view.scrollTo(0, position);
        candidate.scrollTop = position;
        if (doc.body && doc.body !== candidate) doc.body.scrollTop = position;
      } else {
        candidate.scrollTop = position;
      }
    },
    waitForRender: () => new Promise((resolve) => {
      view.setTimeout(resolve, settleMilliseconds);
    }),
  };
}

export async function collectChatGptConversation(
  doc: Document,
  options: CollectionOptions & {
    scrollElement?: HTMLElement;
    settleMilliseconds?: number;
  } = {},
): Promise<ConversationCollection> {
  const {
    scrollElement,
    settleMilliseconds,
    ...collectionOptions
  } = options;
  return collectConversation(
    createDomConversationViewport(doc, scrollElement, settleMilliseconds),
    collectionOptions,
  );
}
