export type MessageRole = 'user' | 'assistant';

export type WarningCode =
  | 'image-unavailable'
  | 'incomplete-collection'
  | 'math-fallback'
  | 'unsupported-content';

export interface WarningProvenance {
  stage: 'asset' | 'extraction' | 'render';
  messageId?: string;
  nodePath?: number[];
  sourceKind?: string;
}

export interface DocumentWarning {
  code: WarningCode;
  message: string;
  provenance: WarningProvenance;
}

interface NodeBase {
  id?: string;
}

export interface TextNode extends NodeBase {
  kind: 'text';
  value: string;
}

export interface StrongNode extends NodeBase {
  kind: 'strong';
  children: InlineNode[];
}

export interface EmphasisNode extends NodeBase {
  kind: 'emphasis';
  children: InlineNode[];
}

export interface InlineCodeNode extends NodeBase {
  kind: 'inlineCode';
  value: string;
}

export interface LinkNode extends NodeBase {
  kind: 'link';
  href: string;
  children: InlineNode[];
  presentation?: 'source';
  title?: string;
}

export interface CitationNode extends NodeBase {
  kind: 'citation';
  href: string;
  label: string;
  title?: string;
}

export interface MathInlineNode extends NodeBase {
  kind: 'mathInline';
  source: string;
  sourceFormat: 'mathml' | 'tex';
  fallbackText: string;
  provenance?: 'explicit' | 'inferred';
}

export interface LineBreakNode extends NodeBase {
  kind: 'lineBreak';
}

export type InlineNode =
  | CitationNode
  | EmphasisNode
  | InlineCodeNode
  | LineBreakNode
  | LinkNode
  | MathInlineNode
  | StrongNode
  | TextNode;

export interface ParagraphNode extends NodeBase {
  kind: 'paragraph';
  children: InlineNode[];
}

export interface HeadingNode extends NodeBase {
  kind: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineNode[];
}

export interface BlockquoteNode extends NodeBase {
  kind: 'blockquote';
  children: BlockNode[];
}

export interface ListItem {
  children: BlockNode[];
}

export interface OrderedListNode extends NodeBase {
  kind: 'orderedList';
  items: ListItem[];
  start: number;
}

export interface UnorderedListNode extends NodeBase {
  kind: 'unorderedList';
  items: ListItem[];
}

export type TableAlignment = 'center' | 'left' | 'right';

export interface TableCell {
  alignment?: TableAlignment;
  children: BlockNode[];
  columnSpan?: number;
  rowSpan?: number;
}

export interface TableRow {
  cells: TableCell[];
}

export interface TableNode extends NodeBase {
  kind: 'table';
  header: TableRow;
  rows: TableRow[];
}

export interface CodeBlockNode extends NodeBase {
  kind: 'codeBlock';
  value: string;
  language?: string;
  mathTokens?: TextFigureMathToken[];
  presentation?: 'code' | 'textFigure';
}

export interface TextFigureMathToken {
  end: number;
  line: number;
  math: MathInlineNode;
  start: number;
}

export interface MathBlockNode extends NodeBase {
  kind: 'mathBlock';
  source: string;
  sourceFormat: 'mathml' | 'tex';
  fallbackText: string;
  provenance?: 'explicit' | 'inferred';
}

export interface ImageSource {
  kind: 'data-url' | 'url';
  value: string;
}

export interface ImageNode extends NodeBase {
  kind: 'image';
  source: ImageSource;
  alt: string;
  fallbackHref?: string;
  height?: number;
  title?: string;
  width?: number;
}

export interface SeparatorNode extends NodeBase {
  kind: 'separator';
}

export interface PageBreakNode extends NodeBase {
  kind: 'pageBreak';
}

export type BlockNode =
  | BlockquoteNode
  | CodeBlockNode
  | HeadingNode
  | ImageNode
  | MathBlockNode
  | OrderedListNode
  | PageBreakNode
  | ParagraphNode
  | SeparatorNode
  | TableNode
  | UnorderedListNode;

export type DocumentNode = BlockNode | InlineNode;

export interface ChatMessage {
  id: string;
  role: MessageRole;
  order: number;
  selected: boolean;
  status: 'complete' | 'streaming';
  content: BlockNode[];
}

export interface ChatDocumentSource {
  platform: 'chatgpt';
  url: string;
  capturedAt: string;
}

export interface ChatDocument {
  version: 1;
  title: string;
  source: ChatDocumentSource;
  exportedAt: string;
  messages: ChatMessage[];
  warnings: DocumentWarning[];
}
