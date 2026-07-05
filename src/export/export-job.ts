import type { ChatDocument, DocumentNode } from '../document/ast';

export type ExportStage = 'collecting' | 'downloading' | 'rendering';

export interface ExportProgress {
  completed: number;
  stage: ExportStage;
  total: number;
}

export interface ExportJobContext {
  report(progress: ExportProgress): void;
  signal: AbortSignal;
  throwIfAborted(): void;
}

export type ExportJobResult<T> =
  | { status: 'busy' }
  | { status: 'cancelled' }
  | { status: 'completed'; value: T };

export interface ExportResourceLimits {
  maxMessages: number;
  maxNodes: number;
  maxOutputBytes: number;
}

export const DEFAULT_EXPORT_LIMITS: ExportResourceLimits = {
  maxMessages: 2_000,
  maxNodes: 100_000,
  maxOutputBytes: 100 * 1024 * 1024,
};

function childNodes(node: DocumentNode): DocumentNode[] {
  switch (node.kind) {
    case 'strong':
    case 'emphasis':
    case 'link':
    case 'paragraph':
    case 'heading':
      return node.children;
    case 'blockquote':
      return node.children;
    case 'orderedList':
    case 'unorderedList':
      return node.items.flatMap(({ children }) => children);
    case 'table':
      return [node.header, ...node.rows]
        .flatMap(({ cells }) => cells)
        .flatMap(({ children }) => children);
    case 'citation':
    case 'codeBlock':
    case 'image':
    case 'inlineCode':
    case 'lineBreak':
    case 'mathBlock':
    case 'mathInline':
    case 'pageBreak':
    case 'separator':
    case 'text':
      return [];
    default:
      return node satisfies never;
  }
}

export function countDocumentNodes(document: ChatDocument): number {
  let count = 0;
  const stack: DocumentNode[] = document.messages.flatMap(({ content }) => content);
  while (stack.length > 0) {
    const node = stack.pop()!;
    count += 1;
    stack.push(...childNodes(node));
  }
  return count;
}

export function assertExportWithinLimits(
  document: ChatDocument,
  limits: ExportResourceLimits = DEFAULT_EXPORT_LIMITS,
): void {
  if (document.messages.length > limits.maxMessages) {
    throw new Error(`Export exceeds the ${limits.maxMessages}-message local limit.`);
  }
  const nodes = countDocumentNodes(document);
  if (nodes > limits.maxNodes) {
    throw new Error(`Export exceeds the ${limits.maxNodes}-node local limit.`);
  }
}

export class LocalExportJobController {
  private active: AbortController | null = null;

  get busy(): boolean {
    return this.active !== null;
  }

  cancel(): void {
    this.active?.abort();
  }

  async run<T>(
    execute: (context: ExportJobContext) => Promise<T>,
    onProgress: (progress: ExportProgress) => void = () => undefined,
  ): Promise<ExportJobResult<T>> {
    if (this.active) return { status: 'busy' };
    const controller = new AbortController();
    this.active = controller;
    const context: ExportJobContext = {
      report: onProgress,
      signal: controller.signal,
      throwIfAborted: () => controller.signal.throwIfAborted(),
    };
    try {
      const value = await execute(context);
      context.throwIfAborted();
      return { status: 'completed', value };
    } catch (error) {
      if (controller.signal.aborted || error instanceof DOMException && error.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      throw error;
    } finally {
      if (this.active === controller) this.active = null;
    }
  }
}
