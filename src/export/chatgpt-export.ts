import type { DocumentWarning } from '../document/ast';
import type {
  ExportRequest,
  ExportSelection,
} from '../document/export';
import {
  createExportFileName,
  DownloadNameRegistry,
  downloadBlob,
} from '../downloads/browser-download';
import {
  collectChatGptConversation,
  type CollectionOptions,
  type ConversationCollection,
} from '../platform/chatgpt/conversation-collector';
import { getExportStrings } from '../localization/strings';
import {
  discoverChatGptPage,
  type DiscoveredChatMessage,
} from '../platform/chatgpt/message-discovery';
import { parseMessageContentResult } from '../platform/chatgpt/content-parser';
import type { UiSettings } from '../settings/settings';
import type {
  ExportCollectionMode,
  ExportIntent,
} from '../ui/actions/ActionGroup';
import { normalizeExportRequestForRendering } from '../document/render-boundary-normalizer';
import {
  assertExportWithinLimits,
  countDocumentNodes,
  DEFAULT_EXPORT_LIMITS,
  type ExportJobContext,
  type ExportResourceLimits,
} from './export-job';
import {
  exportPerformanceNow,
  recordExportDebugTrace,
  recordExportPerformanceTrace,
} from './export-trace';

export interface ChatGptExportResult {
  fileName: string;
  size: number;
  warnings: DocumentWarning[];
}

export interface ChatGptExportDependencies {
  collect(
    document: Document,
    options: CollectionOptions,
  ): Promise<ConversationCollection>;
  collectVisible?(
    document: Document,
    options: VisibleCollectionOptions,
  ): ConversationCollection;
  download(blob: Blob, fileName: string): void;
  now(): Date;
  reserveName?(fileName: string): string;
  render(request: ExportRequest, signal: AbortSignal): Promise<{
    blob: Blob;
    warnings: DocumentWarning[];
  }>;
  waitForFrame?(document: Document, signal: AbortSignal): Promise<void>;
}

export interface VisibleCollectionOptions {
  language: UiSettings['language'];
  maxMessages: number;
  messageIds?: string[];
  recentCount?: number;
}

function selectionFromIntent(intent: ExportIntent): ExportSelection {
  switch (intent.scope) {
    case 'full-conversation':
      return { scope: intent.scope };
    case 'single-response':
      return { messageId: intent.messageId, scope: intent.scope };
    case 'selected-messages':
      return { messageIds: intent.messageIds, scope: intent.scope };
    default:
      return intent satisfies never;
  }
}

function conversationTitle(document: Document): string {
  const heading = document.querySelector('main h1')?.textContent?.trim();
  const title = heading || document.title.replace(/\s*[|·-]\s*ChatGPT.*$/iu, '').trim();
  return title || 'ChatGPT conversation';
}

async function defaultRender(
  request: ExportRequest,
  signal: AbortSignal,
): Promise<{ blob: Blob; warnings: DocumentWarning[] }> {
  if (request.options.format === 'docx') {
    const { renderStructuredDocx } = await import('../renderers/docx/docx-node-renderer');
    return renderStructuredDocx(request, { signal });
  }
  const { renderStructuredPdf } = await import('../renderers/pdf/pdf-node-renderer');
  return renderStructuredPdf(request, { signal });
}

const defaultDownloadNames = new DownloadNameRegistry();

function waitForFrame(document: Document, signal: AbortSignal): Promise<void> {
  const view = document.defaultView;
  if (!view) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    let frame = 0;
    let timeout = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (frame) view.cancelAnimationFrame?.(frame);
      if (timeout) view.clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      if (frame) view.cancelAnimationFrame?.(frame);
      if (timeout) view.clearTimeout(timeout);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    frame = view.requestAnimationFrame?.(finish) ?? 0;
    timeout = view.setTimeout(finish, 50);
  });
}

const DEFAULT_DEPENDENCIES: ChatGptExportDependencies = {
  collect: (document, options) => collectChatGptConversation(document, options),
  collectVisible: collectVisibleChatGptConversation,
  download: downloadBlob,
  now: () => new Date(),
  reserveName: (fileName) => defaultDownloadNames.reserve(fileName),
  render: defaultRender,
  waitForFrame,
};

function visibleMessageWarning(): DocumentWarning {
  return {
    code: 'incomplete-collection',
    message:
      'Export used only messages currently loaded in the page. Run a complete scan if older unloaded messages are required.',
    provenance: { stage: 'extraction', sourceKind: 'conversation' },
  };
}

function visibleMessagesForIntent(
  messages: DiscoveredChatMessage[],
  options: VisibleCollectionOptions,
): DiscoveredChatMessage[] {
  if (options.messageIds) {
    const requested = new Set(options.messageIds);
    const selected = messages.filter(({ id }) => requested.has(id));
    if (selected.length !== requested.size) {
      const missing = options.messageIds.filter((id) => !selected.some((message) => message.id === id));
      throw new Error(
        `Selected message is not currently loaded: ${missing.join(', ')}`,
      );
    }
    return selected;
  }

  if (options.recentCount !== undefined) {
    if (!Number.isInteger(options.recentCount) || options.recentCount < 1) {
      throw new Error('recentCount must be a positive integer.');
    }
    return messages.slice(-options.recentCount);
  }

  return messages;
}

export function collectVisibleChatGptConversation(
  document: Document,
  options: VisibleCollectionOptions,
): ConversationCollection {
  const snapshot = discoverChatGptPage(document);
  const strings = getExportStrings(options.language);
  const warningRecords = new Map<string, DocumentWarning>();

  if (snapshot.capabilities.semanticMessages && !snapshot.capabilities.stableMessageIds) {
    const warning: DocumentWarning = {
      code: 'incomplete-collection',
      message: strings.stableMessageIdWarning,
      provenance: { stage: 'extraction', sourceKind: 'message-identity' },
    };
    warningRecords.set(JSON.stringify(warning), warning);
  }

  const selectedMessages = visibleMessagesForIntent(snapshot.messages, options);
  if (selectedMessages.length > options.maxMessages) {
    throw new Error(`Conversation exceeds the ${options.maxMessages}-message local limit.`);
  }

  const messages = selectedMessages.map((message, order) => {
    const parsed = parseMessageContentResult(
      message.element,
      message.id,
      options.language,
    );
    for (const warning of parsed.warnings) {
      warningRecords.set(JSON.stringify(warning), warning);
    }
    return {
      content: parsed.content,
      id: message.id,
      order,
      role: message.role,
      selected: false,
      status: message.status,
    };
  });

  return {
    duplicateCount: 0,
    messages,
    snapshotCount: 1,
    warnings: [...warningRecords.values()],
  };
}

function collectionModeFromIntent(intent: ExportIntent): ExportCollectionMode {
  if (intent.collectionMode) return intent.collectionMode;
  return intent.scope === 'full-conversation' ? 'scan-complete' : 'visible-only';
}

function visibleCollectionOptions(
  intent: ExportIntent,
  settings: UiSettings,
  limits: ExportResourceLimits,
): VisibleCollectionOptions {
  const mode = collectionModeFromIntent(intent);
  return {
    language: settings.language,
    maxMessages: limits.maxMessages,
    ...(intent.scope === 'single-response' ? { messageIds: [intent.messageId] } : {}),
    ...(intent.scope === 'selected-messages' ? { messageIds: intent.messageIds } : {}),
    ...(mode === 'recent' && intent.scope === 'full-conversation'
      ? { recentCount: intent.recentCount ?? 10 }
      : {}),
  };
}

function preformattedLengths(messages: readonly DiscoveredChatMessage[]): number[] {
  return messages.flatMap(({ element }) => [...element.querySelectorAll('pre')].map((pre) => {
    const html = pre as HTMLElement;
    const value = typeof html.innerText === 'string' && html.innerText.trim().length > 0
      ? html.innerText
      : pre.textContent ?? '';
    return value.trim().length;
  }));
}

async function stabilizeVisiblePreformattedBlocks(
  document: Document,
  options: VisibleCollectionOptions,
  signal: AbortSignal,
  dependencies: ChatGptExportDependencies,
): Promise<void> {
  const snapshot = discoverChatGptPage(document);
  const messages = visibleMessagesForIntent(snapshot.messages, options);
  const wait = dependencies.waitForFrame ?? waitForFrame;
  let previousSignature = '';
  for (let sample = 0; sample < 6; sample += 1) {
    const lengths = preformattedLengths(messages);
    if (lengths.length === 0) return;
    const signature = lengths.join(',');
    if (lengths.every((length) => length > 0) && signature === previousSignature) return;
    previousSignature = signature;
    if (sample < 5) await wait(document, signal);
  }
  throw new Error(getExportStrings(options.language).preformattedContentDidNotStabilize);
}

async function collectForIntent(
  document: Document,
  intent: ExportIntent,
  settings: UiSettings,
  context: ExportJobContext,
  limits: ExportResourceLimits,
  dependencies: ChatGptExportDependencies,
): Promise<ConversationCollection> {
  const mode = collectionModeFromIntent(intent);
  if (mode === 'scan-complete') {
    return dependencies.collect(document, {
      language: settings.language,
      maxMessages: limits.maxMessages,
      onProgress: (completed, total) => {
        context.report({ completed, stage: 'collecting', total });
      },
      signal: context.signal,
    });
  }

  const visibleOptions = visibleCollectionOptions(intent, settings, limits);
  await stabilizeVisiblePreformattedBlocks(
    document,
    visibleOptions,
    context.signal,
    dependencies,
  );
  const collectVisible = dependencies.collectVisible ?? collectVisibleChatGptConversation;
  const collection = collectVisible(document, visibleOptions);
  if (mode === 'recent' || intent.scope === 'full-conversation') {
    collection.warnings = [visibleMessageWarning(), ...collection.warnings];
  }
  context.report({ completed: 1, stage: 'collecting', total: 1 });
  return collection;
}

export async function executeChatGptExport(
  document: Document,
  intent: ExportIntent,
  settings: UiSettings,
  context: ExportJobContext,
  limits: ExportResourceLimits = DEFAULT_EXPORT_LIMITS,
  dependencies: ChatGptExportDependencies = DEFAULT_DEPENDENCIES,
): Promise<ChatGptExportResult> {
  const exportStartedAt = exportPerformanceNow();
  context.report({ completed: 0, stage: 'collecting', total: 1 });
  const collectingStartedAt = exportPerformanceNow();
  const collection = await collectForIntent(
    document,
    intent,
    settings,
    context,
    limits,
    dependencies,
  );
  const collectedAt = exportPerformanceNow();
  context.throwIfAborted();
  const normalizingStartedAt = exportPerformanceNow();
  const now = dependencies.now();
  const request: ExportRequest = {
    document: {
      version: 1,
      exportedAt: now.toISOString(),
      messages: collection.messages,
      source: {
        platform: 'chatgpt',
        capturedAt: now.toISOString(),
        url: document.location.href,
      },
      title: conversationTitle(document),
      warnings: collection.warnings,
    },
    options: {
      ...settings,
      format: intent.format,
    },
    selection: selectionFromIntent(intent),
  };
  const renderRequest = normalizeExportRequestForRendering(request);
  recordExportDebugTrace(renderRequest);
  assertExportWithinLimits(renderRequest.document, limits);
  const nodeCount = countDocumentNodes(renderRequest.document);
  const normalizedAt = exportPerformanceNow();
  context.report({ completed: 0, stage: 'rendering', total: 1 });
  const renderingStartedAt = exportPerformanceNow();
  const rendered = await dependencies.render(renderRequest, context.signal);
  const renderedAt = exportPerformanceNow();
  context.throwIfAborted();
  if (rendered.blob.size > limits.maxOutputBytes) {
    throw new Error(`Export exceeds the ${limits.maxOutputBytes}-byte local output limit.`);
  }
  context.report({ completed: 1, stage: 'rendering', total: 1 });
  const proposedFileName = createExportFileName({
    exportedAt: now,
    format: intent.format,
    preferredName: settings.fileName,
    title: renderRequest.document.title,
  });
  const fileName = dependencies.reserveName?.(proposedFileName) ?? proposedFileName;
  context.report({ completed: 0, stage: 'downloading', total: 1 });
  context.throwIfAborted();
  const downloadingStartedAt = exportPerformanceNow();
  dependencies.download(rendered.blob, fileName);
  const downloadedAt = exportPerformanceNow();
  recordExportPerformanceTrace({
    exportedAt: renderRequest.document.exportedAt,
    format: intent.format,
    messages: renderRequest.document.messages.length,
    nodes: nodeCount,
    outputBytes: rendered.blob.size,
    stages: [
      { durationMs: collectedAt - collectingStartedAt, name: 'collecting' },
      { durationMs: normalizedAt - normalizingStartedAt, name: 'normalizing' },
      { durationMs: renderedAt - renderingStartedAt, name: 'rendering' },
      { durationMs: downloadedAt - downloadingStartedAt, name: 'downloading' },
      { durationMs: downloadedAt - exportStartedAt, name: 'total' },
    ],
    title: renderRequest.document.title,
    warnings: rendered.warnings.length,
  });
  context.report({ completed: 1, stage: 'downloading', total: 1 });
  return {
    fileName,
    size: rendered.blob.size,
    warnings: rendered.warnings,
  };
}
