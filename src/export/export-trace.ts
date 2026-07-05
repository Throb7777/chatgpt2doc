import type {
  BlockNode,
  ChatDocument,
  ChatMessage,
  InlineNode,
  MathBlockNode,
  MathInlineNode,
} from '../document/ast';
import type { ExportRequest } from '../document/export';
import { parseMathExpression } from '../renderers/math/math-expression';
import { exportBuildFingerprint } from './build-info';

type MathTraceNode = MathBlockNode | MathInlineNode;

export interface ExportDebugTrace {
  buildFingerprint: string;
  exportedAt: string;
  format: ExportRequest['options']['format'];
  messages: Array<{
    blockKinds: string[];
    codeBlocks: Array<{
      chars: number;
      lines: number;
      presentation: string;
    }>;
    id: string;
    mathSources: Array<{
      fallbackHash: string;
      fallbackLength: number;
      fallbackTexParseable: boolean;
      kind: MathTraceNode['kind'];
      mathMlElements: string[];
      path: number[];
      provenance: MathTraceNode['provenance'] | 'unknown';
      sourceFormat: MathTraceNode['sourceFormat'];
      sourceHash: string;
      sourceLength: number;
      sourceTexCommands: string[];
      sourceTexParseable?: boolean;
    }>;
    mathNodes: number;
    order: number;
    paragraphs: Array<{ chars: number; inlineKinds: string[] }>;
    role: string;
    targetSignals: {
      tauIntervalMathCount: number;
      tauIntervalTextLikeCount: number;
    };
  }>;
  selection: ExportRequest['selection'];
  snapshotId: string;
  summary: {
    emptyPreformattedBlocks: number;
    mathNodes: number;
    messages: number;
    preformattedBlockChars: number[];
    preformattedBlocks: number;
    texCommands: string[];
  };
}

export interface ExportPerformanceTrace {
  buildFingerprint: string;
  exportedAt: string;
  format: ExportRequest['options']['format'];
  messages: number;
  nodes: number;
  outputBytes: number;
  stages: Array<{
    durationMs: number;
    name: 'collecting' | 'normalizing' | 'rendering' | 'downloading' | 'total';
  }>;
  title: string;
  warnings: number;
}

declare global {
  var __CHAT_EXPORT_LAST_PERF__: ExportPerformanceTrace | undefined;
  var __CHAT_EXPORT_LAST_TRACE__: ExportDebugTrace | undefined;
}

const recordedDebugTraces = new WeakMap<ExportRequest, ExportDebugTrace>();

const TAU_INTERVAL_TEXT_PATTERN = /τ[\s\u00a0\u200b\u200c\u200d]*∈[\s\u00a0\u200b\u200c\u200d]*\[[\s\u00a0\u200b\u200c\u200d]*0[\s\u00a0\u200b\u200c\u200d]*,[\s\u00a0\u200b\u200c\u200d]*H[\s\u00a0\u200b\u200c\u200d]*\]/gu;

function stableHash(value: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193) >>> 0;
    right = Math.imul(right ^ code, 0x85ebca6b) >>> 0;
  }
  return `${left.toString(16).padStart(8, '0')}${right.toString(16).padStart(8, '0')}`;
}

function texCommands(source: string): string[] {
  return [...source.matchAll(/\\([A-Za-z]+)/gu)].map((match) => match[1] as string);
}

function mathMlElements(source: string): string[] {
  return [...new Set([...source.matchAll(/<\/?([A-Za-z][\w:-]*)\b/gu)]
    .map((match) => match[1] as string))]
    .sort();
}

function texParseable(source: string): boolean {
  try {
    parseMathExpression(source, 'tex');
    return true;
  } catch {
    return false;
  }
}

function canonicalPreformattedValue(value: string): string {
  return value.replace(/\r\n?/gu, '\n').replace(/\n+$/u, '');
}

function canonicalSnapshotBlock(node: BlockNode): BlockNode {
  switch (node.kind) {
    case 'codeBlock':
      return { ...node, value: canonicalPreformattedValue(node.value) };
    case 'blockquote':
      return { ...node, children: node.children.map(canonicalSnapshotBlock) };
    case 'orderedList':
    case 'unorderedList':
      return {
        ...node,
        items: node.items.map((item) => ({
          children: item.children.map(canonicalSnapshotBlock),
        })),
      };
    case 'table':
      return {
        ...node,
        header: {
          cells: node.header.cells.map((cell) => ({
            ...cell,
            children: cell.children.map(canonicalSnapshotBlock),
          })),
        },
        rows: node.rows.map((row) => ({
          cells: row.cells.map((cell) => ({
            ...cell,
            children: cell.children.map(canonicalSnapshotBlock),
          })),
        })),
      };
    case 'heading':
    case 'image':
    case 'mathBlock':
    case 'pageBreak':
    case 'paragraph':
    case 'separator':
      return node;
    default:
      return node satisfies never;
  }
}

function canonicalSnapshotMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    content: message.content.map(canonicalSnapshotBlock),
  }));
}

function snapshotId(request: ExportRequest): string {
  return `s1-${stableHash(JSON.stringify(canonicalSnapshotMessages(selectedMessages(request))))}`;
}

function mathSourceTrace(
  node: MathTraceNode,
  path: number[],
): ExportDebugTrace['messages'][number]['mathSources'][number] {
  return {
    fallbackHash: stableHash(node.fallbackText),
    fallbackLength: node.fallbackText.length,
    fallbackTexParseable: texParseable(node.fallbackText),
    kind: node.kind,
    mathMlElements: node.sourceFormat === 'mathml' ? mathMlElements(node.source) : [],
    path,
    provenance: node.provenance ?? 'unknown',
    sourceFormat: node.sourceFormat,
    sourceHash: stableHash(node.source),
    sourceLength: node.source.length,
    sourceTexCommands: node.sourceFormat === 'tex' ? [...new Set(texCommands(node.source))].sort() : [],
    ...(node.sourceFormat === 'tex' ? { sourceTexParseable: texParseable(node.source) } : {}),
  };
}

function selectedMessages(request: ExportRequest): ChatDocument['messages'] {
  const messages = [...request.document.messages].sort((left, right) => left.order - right.order);
  const selection = request.selection;
  const selected = (() => {
    switch (selection.scope) {
      case 'full-conversation':
        return messages;
      case 'assistant-only':
        return messages.filter(({ role }) => role === 'assistant');
      case 'single-response':
        return messages.filter(({ id }) => id === selection.messageId);
      case 'selected-messages': {
        const ids = new Set(selection.messageIds);
        return messages.filter(({ id }) => ids.has(id));
      }
      default:
        return selection satisfies never;
    }
  })();
  return request.options.includePrompts
    ? selected
    : selected.filter(({ role }) => role !== 'user');
}

function inlineStats(nodes: readonly InlineNode[]): {
  chars: number;
  inlineKinds: string[];
  mathNodes: number;
  tauIntervalMathCount: number;
  tauIntervalTextLikeCount: number;
} {
  return nodes.reduce((stats, node) => {
    stats.inlineKinds.push(node.kind);
    if (node.kind === 'text') {
      stats.chars += node.value.length;
      stats.tauIntervalTextLikeCount += node.value.match(TAU_INTERVAL_TEXT_PATTERN)?.length ?? 0;
    } else if (node.kind === 'mathInline') {
      stats.mathNodes += 1;
      if (TAU_INTERVAL_TEXT_PATTERN.test(node.fallbackText)) {
        stats.tauIntervalMathCount += 1;
      }
      TAU_INTERVAL_TEXT_PATTERN.lastIndex = 0;
    } else if (node.kind === 'strong' || node.kind === 'emphasis' || node.kind === 'link') {
      const child = inlineStats(node.children);
      stats.chars += child.chars;
      stats.inlineKinds.push(...child.inlineKinds);
      stats.mathNodes += child.mathNodes;
      stats.tauIntervalMathCount += child.tauIntervalMathCount;
      stats.tauIntervalTextLikeCount += child.tauIntervalTextLikeCount;
    } else if (node.kind === 'inlineCode') {
      stats.chars += node.value.length;
    } else if (node.kind === 'citation') {
      stats.chars += node.label.length;
    }
    return stats;
  }, {
    chars: 0,
    inlineKinds: [] as string[],
    mathNodes: 0,
    tauIntervalMathCount: 0,
    tauIntervalTextLikeCount: 0,
  });
}

function blockStats(blocks: readonly BlockNode[]): {
  blockKinds: string[];
  codeBlocks: ExportDebugTrace['messages'][number]['codeBlocks'];
  mathSources: ExportDebugTrace['messages'][number]['mathSources'];
  mathNodes: number;
  paragraphs: ExportDebugTrace['messages'][number]['paragraphs'];
  tauIntervalMathCount: number;
  tauIntervalTextLikeCount: number;
} {
  const output = {
    blockKinds: [] as string[],
    codeBlocks: [] as ExportDebugTrace['messages'][number]['codeBlocks'],
    mathSources: [] as ExportDebugTrace['messages'][number]['mathSources'],
    mathNodes: 0,
    paragraphs: [] as ExportDebugTrace['messages'][number]['paragraphs'],
    tauIntervalMathCount: 0,
    tauIntervalTextLikeCount: 0,
  };
  const visitInline = (nodes: readonly InlineNode[], path: number[]): void => {
    nodes.forEach((node, index) => {
      const childPath = [...path, index];
      if (node.kind === 'mathInline') {
        output.mathSources.push(mathSourceTrace(node, childPath));
      } else if (node.kind === 'strong' || node.kind === 'emphasis' || node.kind === 'link') {
        visitInline(node.children, childPath);
      }
    });
  };
  const visit = (nodes: readonly BlockNode[], path: number[] = []): void => {
    nodes.forEach((node, index) => {
      const childPath = [...path, index];
      output.blockKinds.push(node.kind);
      if (node.kind === 'paragraph' || node.kind === 'heading') {
        const stats = inlineStats(node.children);
        visitInline(node.children, childPath);
        output.paragraphs.push({
          chars: stats.chars,
          inlineKinds: [...new Set(stats.inlineKinds)],
        });
        output.mathNodes += stats.mathNodes;
        output.tauIntervalMathCount += stats.tauIntervalMathCount;
        output.tauIntervalTextLikeCount += stats.tauIntervalTextLikeCount;
      } else if (node.kind === 'mathBlock') {
        output.mathNodes += 1;
        output.mathSources.push(mathSourceTrace(node, childPath));
      } else if (node.kind === 'codeBlock') {
        const value = canonicalPreformattedValue(node.value);
        output.codeBlocks.push({
          chars: value.length,
          lines: Math.max(1, value.split('\n').length),
          presentation: node.presentation ?? 'code',
        });
        node.mathTokens?.forEach((token, tokenIndex) => {
          output.mathSources.push(mathSourceTrace(token.math, [...childPath, tokenIndex]));
        });
        output.mathNodes += node.mathTokens?.length ?? 0;
      } else if (node.kind === 'blockquote') {
        visit(node.children, childPath);
      } else if (node.kind === 'orderedList' || node.kind === 'unorderedList') {
        node.items.forEach((item, itemIndex) => visit(item.children, [...childPath, itemIndex]));
      } else if (node.kind === 'table') {
        [node.header, ...node.rows].forEach((row, rowIndex) => {
          row.cells.forEach((cell, cellIndex) =>
            visit(cell.children, [...childPath, rowIndex, cellIndex]));
        });
      }
    });
  };
  visit(blocks);
  return output;
}

function inlineTexCommands(nodes: readonly InlineNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.kind === 'mathInline') {
      return node.sourceFormat === 'tex' ? texCommands(node.source) : [];
    }
    if (node.kind === 'strong' || node.kind === 'emphasis' || node.kind === 'link') {
      return inlineTexCommands(node.children);
    }
    return [];
  });
}

function blockTexCommands(blocks: readonly BlockNode[]): string[] {
  const commands: string[] = [];
  const visit = (nodes: readonly BlockNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'paragraph' || node.kind === 'heading') {
        commands.push(...inlineTexCommands(node.children));
      } else if (node.kind === 'mathBlock' && node.sourceFormat === 'tex') {
        commands.push(...texCommands(node.source));
      } else if (node.kind === 'codeBlock') {
        for (const token of node.mathTokens ?? []) {
          if (token.math.sourceFormat === 'tex') {
            commands.push(...texCommands(token.math.source));
          }
        }
      } else if (node.kind === 'blockquote') {
        visit(node.children);
      } else if (node.kind === 'orderedList' || node.kind === 'unorderedList') {
        for (const item of node.items) visit(item.children);
      } else if (node.kind === 'table') {
        for (const row of [node.header, ...node.rows]) {
          for (const cell of row.cells) visit(cell.children);
        }
      }
    }
  };
  visit(blocks);
  return commands;
}

export function createExportDebugTrace(request: ExportRequest): ExportDebugTrace {
  const messages = selectedMessages(request);
  const messageTraces = messages.map((message) => {
    const stats = blockStats(message.content);
    return {
      blockKinds: stats.blockKinds,
      codeBlocks: stats.codeBlocks,
      id: message.id,
      mathSources: stats.mathSources,
      mathNodes: stats.mathNodes,
      order: message.order,
      paragraphs: stats.paragraphs,
      role: message.role,
      targetSignals: {
        tauIntervalMathCount: stats.tauIntervalMathCount,
        tauIntervalTextLikeCount: stats.tauIntervalTextLikeCount,
      },
    };
  });
  const preformattedBlockChars = messageTraces.flatMap(({ codeBlocks }) =>
    codeBlocks.map(({ chars }) => chars));
  return {
    buildFingerprint: exportBuildFingerprint(),
    exportedAt: request.document.exportedAt,
    format: request.options.format,
    messages: messageTraces,
    selection: request.selection,
    snapshotId: snapshotId(request),
    summary: {
      emptyPreformattedBlocks: preformattedBlockChars.filter((chars) => chars === 0).length,
      mathNodes: messageTraces.reduce((total, message) => total + message.mathNodes, 0),
      messages: messageTraces.length,
      preformattedBlockChars,
      preformattedBlocks: preformattedBlockChars.length,
      texCommands: [...new Set(messages.flatMap((message) =>
        blockTexCommands(message.content)))].sort(),
    },
  };
}

export function exportDiagnosticFingerprint(request: ExportRequest): string {
  const trace = recordedDebugTraces.get(request) ?? createExportDebugTrace(request);
  const summary = trace.summary;
  return [
    'trace:v1',
    `snapshot:${trace.snapshotId}`,
    `messages:${summary.messages}`,
    `math:${summary.mathNodes}`,
    `pre:${summary.preformattedBlocks}`,
    `empty:${summary.emptyPreformattedBlocks}`,
    `preChars:${summary.preformattedBlockChars.join(',') || 'none'}`,
    `tex:${summary.texCommands.join(',') || 'none'}`,
  ].join(' ');
}

export function recordExportDebugTrace(request: ExportRequest): ExportDebugTrace {
  const trace = createExportDebugTrace(request);
  recordedDebugTraces.set(request, trace);
  globalThis.__CHAT_EXPORT_LAST_TRACE__ = trace;
  return trace;
}

export function exportPerformanceNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function recordExportPerformanceTrace(
  trace: Omit<ExportPerformanceTrace, 'buildFingerprint'>,
): ExportPerformanceTrace {
  const recorded = {
    ...trace,
    buildFingerprint: exportBuildFingerprint(),
  };
  globalThis.__CHAT_EXPORT_LAST_PERF__ = recorded;
  return recorded;
}
