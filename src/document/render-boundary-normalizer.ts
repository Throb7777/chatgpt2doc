import type {
  BlockNode,
  ChatDocument,
  ChatMessage,
  InlineNode,
  ListItem,
  TableCell,
  TableRow,
  TextNode,
} from './ast';
import type { ExportRequest } from './export';
import { inferMathSpans } from './math-inference';

function normalizedTextMathSource(value: string): string {
  return value.replace(/[\s\u00a0\u200b\u200c\u200d]+/gu, '');
}

function inferredMathNode(value: string): InlineNode {
  const compact = normalizedTextMathSource(value);
  return {
    fallbackText: compact,
    kind: 'mathInline',
    provenance: 'inferred',
    source: compact.replace(/_([A-Za-z]{2,})/gu, '_{$1}'),
    sourceFormat: 'tex',
  };
}

function splitTextNode(node: TextNode): InlineNode[] {
  const spans = inferMathSpans(node.value, false);
  if (spans.length === 0) return [node];
  const output: InlineNode[] = [];
  let offset = 0;
  for (const span of spans) {
    const before = node.value.slice(offset, span.start);
    if (before) output.push({ kind: 'text', value: before });
    output.push(inferredMathNode(node.value.slice(span.start, span.end)));
    offset = span.end;
  }
  const after = node.value.slice(offset);
  if (after) output.push({ kind: 'text', value: after });
  return output;
}

function normalizeInlineNode(node: InlineNode): InlineNode[] {
  switch (node.kind) {
    case 'text':
      return splitTextNode(node);
    case 'strong':
    case 'emphasis':
    case 'link':
      return [{
        ...node,
        children: node.children.flatMap(normalizeInlineNode),
      }];
    case 'citation':
    case 'inlineCode':
    case 'lineBreak':
    case 'mathInline':
      return [node];
    default:
      return node satisfies never;
  }
}

function normalizeListItem(item: ListItem): ListItem {
  return { children: item.children.map(normalizeBlockNode) };
}

function normalizeTableCell(cell: TableCell): TableCell {
  return { ...cell, children: cell.children.map(normalizeBlockNode) };
}

function normalizeTableRow(row: TableRow): TableRow {
  return { cells: row.cells.map(normalizeTableCell) };
}

function normalizeBlockNode(node: BlockNode): BlockNode {
  switch (node.kind) {
    case 'paragraph':
    case 'heading':
      return { ...node, children: node.children.flatMap(normalizeInlineNode) };
    case 'blockquote':
      return { ...node, children: node.children.map(normalizeBlockNode) };
    case 'orderedList':
    case 'unorderedList':
      return { ...node, items: node.items.map(normalizeListItem) };
    case 'table':
      return {
        ...node,
        header: normalizeTableRow(node.header),
        rows: node.rows.map(normalizeTableRow),
      };
    case 'codeBlock':
    case 'image':
    case 'mathBlock':
    case 'pageBreak':
    case 'separator':
      return node;
    default:
      return node satisfies never;
  }
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  return { ...message, content: message.content.map(normalizeBlockNode) };
}

export function normalizeDocumentForRendering(document: ChatDocument): ChatDocument {
  return { ...document, messages: document.messages.map(normalizeMessage) };
}

export function normalizeExportRequestForRendering(request: ExportRequest): ExportRequest {
  return { ...request, document: normalizeDocumentForRendering(request.document) };
}
