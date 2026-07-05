import type { ChatDocument } from './ast';

export type ExportFormat = 'docx' | 'pdf';
export type ExportLanguage = 'en' | 'zh-CN';

export type ExportSelection =
  | { scope: 'assistant-only' }
  | { scope: 'full-conversation' }
  | { scope: 'selected-messages'; messageIds: string[] }
  | { scope: 'single-response'; messageId: string };

export type ExportScope = ExportSelection['scope'];

export interface ExportOptions {
  format: ExportFormat;
  paper: 'a4' | 'letter';
  fileName: string;
  includePrompts: boolean;
  language: ExportLanguage;
  theme: 'dark' | 'light';
  codeStyle: 'document' | 'dark' | 'light';
}

export interface ExportRequest {
  document: ChatDocument;
  selection: ExportSelection;
  options: ExportOptions;
}
