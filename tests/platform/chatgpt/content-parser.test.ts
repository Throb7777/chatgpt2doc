import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import type { BlockNode, DocumentNode } from '../../../src/document/ast';
import {
  parseMessageContent,
  parseMessageContentResult,
} from '../../../src/platform/chatgpt/content-parser';

const richHtml = readFileSync(
  new URL('../../fixtures/chatgpt/rich-content.html', import.meta.url),
  'utf8',
);
const referenceHtml = readFileSync(
  new URL('../../fixtures/reference/synthetic-conversation.html', import.meta.url),
  'utf8',
);
const m11ReducedHtml = readFileSync(
  new URL('../../fixtures/chatgpt/m11-real-world-reduced.html', import.meta.url),
  'utf8',
);
const m12SemanticHtml = readFileSync(
  new URL('../../fixtures/chatgpt/m12-semantic-boundaries.html', import.meta.url),
  'utf8',
);

function parseAssistant(html: string): BlockNode[] {
  const document = new JSDOM(html, { url: 'https://chatgpt.com/c/fixture' }).window.document;
  const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]');
  if (!message) throw new Error('Assistant fixture message is missing.');
  return parseMessageContent(message);
}

function walkNodes(nodes: DocumentNode[]): DocumentNode[] {
  const walked: DocumentNode[] = [];
  for (const node of nodes) {
    walked.push(node);
    if ('children' in node) walked.push(...walkNodes(node.children));
    if (node.kind === 'orderedList' || node.kind === 'unorderedList') {
      for (const item of node.items) walked.push(...walkNodes(item.children));
    }
    if (node.kind === 'table') {
      for (const row of [node.header, ...node.rows]) {
        for (const cell of row.cells) walked.push(...walkNodes(cell.children));
      }
    }
  }
  return walked;
}

describe('ChatGPT rich-content parser', () => {
  it('matches the representative AST snapshot exactly', () => {
    expect(parseAssistant(richHtml)).toMatchSnapshot();
  });

  it('covers the shared long fixture structures without losing empty cells or nesting', () => {
    const blocks = parseAssistant(referenceHtml);
    const nodes = walkNodes(blocks);
    const kinds = new Set(nodes.map(({ kind }) => kind));
    const table = nodes.find((node) => node.kind === 'table');
    const formulas = nodes.filter((node) =>
      node.kind === 'mathInline' || node.kind === 'mathBlock');
    const image = nodes.find((node) => node.kind === 'image');
    const nestedList = nodes.find((node) =>
      node.kind === 'unorderedList'
      && walkNodes(node.items.flatMap((item) => item.children))
        .some((child) => child.kind === 'unorderedList'));

    expect(kinds).toEqual(new Set([
      'blockquote',
      'citation',
      'codeBlock',
      'emphasis',
      'heading',
      'image',
      'inlineCode',
      'link',
      'mathBlock',
      'mathInline',
      'orderedList',
      'paragraph',
      'strong',
      'table',
      'text',
      'unorderedList',
    ]));
    expect(formulas).toHaveLength(8);
    expect(table?.kind === 'table' ? table.rows[1]?.cells[3]?.children : null).toEqual([]);
    expect(nestedList).toBeDefined();
    expect(image).toMatchObject({
      kind: 'image',
      alt: 'Synthetic three-bar chart',
      source: { kind: 'data-url' },
      width: 240,
      height: 100,
    });
  });

  it('excludes the extension own controls from content and warning discovery', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="assistant-ui">',
      '<p>Actual answer.</p>',
      '<div data-chat-export-actions="response">',
      '<button data-chat-export-format="docx">Export response DOCX</button>',
      '</div>',
      '<div data-chat-export-selection="assistant-ui"><input type="checkbox"></div>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/extension-ui' }).window.document;
    const message = document.querySelector<HTMLElement>('article')!;

    const result = parseMessageContentResult(message, 'assistant-ui');

    expect(JSON.stringify(result.content)).toContain('Actual answer.');
    expect(JSON.stringify(result.content)).not.toContain('Export response');
    expect(result.warnings).toEqual([]);
  });

  it('drops decorative citation source icons without visible image fallback warnings', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="citation-icons">',
      '<p>DBLP confirms the paper ',
      '<a href="https://dblp.org/rec/example" class="source-link">',
      '<img src="https://dblp.org/favicon.ico" alt="" width="16" height="16">',
      'dblp',
      '</a>',
      ' and ACM confirms the affiliation ',
      '<a href="https://dl.acm.org/example" data-citation="true">',
      '<svg width="14" height="14" aria-hidden="true"><path d="M0 0h14v14H0z"/></svg>',
      'ACM数字图书馆',
      '</a>.',
      '</p>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/citations' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'citation-icons');
    const text = walkNodes(result.content)
      .filter((node) => node.kind === 'text')
      .map((node) => node.kind === 'text' ? node.value : '')
      .join('');

    expect(text).toContain('DBLP confirms the paper ');
    expect(text).toContain(' and ACM confirms the affiliation ');
    expect(text).not.toContain('Inline image fallback');
    expect(walkNodes(result.content).filter((node) => node.kind === 'link'))
      .toMatchObject([
        { href: 'https://dblp.org/rec/example' },
        { href: 'https://dl.acm.org/example' },
      ]);
    expect(JSON.stringify(result.content)).toContain('dblp');
    expect(JSON.stringify(result.content)).toContain('ACM数字图书馆');
    expect(result.warnings).toEqual([]);
  });

  it('drops sibling citation source icons without dimensions', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="citation-sibling-icons">',
      '<p>Sources: ',
      '<span class="source-icon-wrapper">',
      '<img src="https://example.test/favicon.ico" alt="">',
      '</span>',
      '<a href="https://example.test/admissions">研究生招生网</a>',
      ', ',
      '<span data-testid="citation-icon">',
      '<svg aria-hidden="true"><path d="M0 0h12v12H0z"/></svg>',
      '</span>',
      '<a href="https://dblp.org/rec/example">dblp</a>',
      '</p>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/citation-sibling-icons' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'citation-sibling-icons');

    expect(JSON.stringify(result.content)).not.toContain('Inline image fallback');
    expect(JSON.stringify(result.content)).toContain('研究生招生网');
    expect(JSON.stringify(result.content)).toContain('dblp');
    expect(walkNodes(result.content).filter((node) => node.kind === 'link'))
      .toMatchObject([
        { href: 'https://example.test/admissions' },
        { href: 'https://dblp.org/rec/example' },
      ]);
    expect(result.warnings).toEqual([]);
  });

  it('drops non-anchor source chip icons while preserving the visible chip label', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="source-chip-icons">',
      '<p>内蒙古大学副教授。',
      '<span class="inline-flex items-center gap-1 rounded-full bg-token-sidebar-surface-secondary">',
      '<span class="inline-grid size-4"><svg aria-hidden="true"><circle cx="8" cy="8" r="7"/></svg></span>',
      '<span class="truncate">物理科学与技术...</span>',
      '</span>',
      '</p>',
      '<p>复旦大学附属华山医院也有白玉龙，',
      '<button class="inline-flex items-center rounded-full" type="button">',
      '<img src="data:image/png;base64,AA==" alt="" style="width:16px;height:16px">',
      '<span>好大夫在线</span>',
      '</button>',
      ' 这也明显不是东南统计博士申请者。</p>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/source-chip-icons' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'source-chip-icons');
    const serialized = JSON.stringify(result.content);

    expect(serialized).not.toContain('Inline image fallback');
    expect(serialized).toContain('物理科学与技术...');
    expect(serialized).toContain('好大夫在线');
    expect(result.warnings).toEqual([]);
  });

  it('uses the rendered favicon size when intrinsic image attributes are larger', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="rendered-source-favicon">',
      '<p>复旦大学附属华山医院也有白玉龙，',
      '<a href="https://www.haodf.com/doctor/155984.html" class="flex overflow-hidden rounded-xl">',
      '<span class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full">',
      '<img alt="" width="128" height="128" class="h-3 w-3 rounded-full" ',
      'src="https://www.google.com/s2/favicons?domain=https://www.haodf.com&amp;sz=128">',
      '</span>',
      '<span class="max-w-[15ch] grow truncate overflow-hidden text-center">好大夫在线</span>',
      '</a>。',
      '</p>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/rendered-source-favicon' }).window.document;
    const icon = document.querySelector<HTMLImageElement>('img')!;
    icon.getBoundingClientRect = () => ({
      height: 12.7427,
      width: 12.7427,
    } as DOMRect);
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'rendered-source-favicon');
    const serialized = JSON.stringify(result.content);

    expect(serialized).toContain('好大夫在线');
    expect(serialized).toContain('https://www.haodf.com/doctor/155984.html');
    expect(serialized).not.toContain('Inline image fallback');
    expect(walkNodes(result.content).find((node) =>
      node.kind === 'link' && node.href === 'https://www.haodf.com/doctor/155984.html'))
      .toMatchObject({ presentation: 'source' });
    expect(result.warnings).toEqual([]);
  });

  it('keeps ordinary icon action buttons out while preserving source chips', () => {
    const actionButtons = Array.from({ length: 40 }, (_, index) =>
      `<button type="button"><svg aria-hidden="true"></svg><span>Copy ${index}</span></button>`)
      .join('');
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="source-chip-hot-path">',
      '<div class="markdown prose">',
      '<p>Body text ',
      '<button class="inline-flex items-center rounded-full" type="button">',
      '<img src="data:image/png;base64,AA==" alt="" style="width:16px;height:16px">',
      '<span>Good Doctor</span>',
      '</button>',
      '</p>',
      '<div data-message-actions="true">',
      actionButtons,
      '</div>',
      '</div>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/source-chip-hot-path' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'source-chip-hot-path');
    const serialized = JSON.stringify(result.content);

    expect(serialized).toContain('Body text');
    expect(serialized).toContain('Good Doctor');
    expect(serialized).not.toContain('Copy 0');
    expect(serialized).not.toContain('Copy 39');
    expect(result.warnings).toEqual([]);
  });

  it('does not re-admit this extension own export buttons as source chips', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="image-only-chat">',
      '<div data-message-content>',
      '<figure><img src="https://example.test/generated.png" alt="Generated gauge" width="640" height="360"></figure>',
      '<button type="button" class="chat-export-action-button chat-export-format-button" data-chat-export-format="docx">',
      '<img alt="Create Word Docs" width="16" height="16" src="data:image/png;base64,AA==">',
      'Export response as a Word file',
      '</button>',
      '<button type="button" class="chat-export-action-button chat-export-format-button" data-chat-export-format="pdf">',
      '<img alt="Create PDF Docs" width="16" height="16" src="data:image/png;base64,AA==">',
      'Export response as a PDF file',
      '</button>',
      '</div>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/image-only-chat' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'image-only-chat');
    const serialized = JSON.stringify(result.content);

    expect(serialized).toContain('Generated gauge');
    expect(serialized).not.toContain('Create Word Docs');
    expect(serialized).not.toContain('Create PDF Docs');
    expect(serialized).not.toContain('Export response as a Word file');
    expect(serialized).not.toContain('Export response as a PDF file');
    expect(serialized).not.toContain('Inline image fallback');
    expect(result.warnings).toEqual([]);
  });

  it('drops legacy export controls when image-only content falls back to the message root', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="image-only-legacy-actions">',
      '<figure><img src="https://example.test/generated-gauge.png" alt="Generated gauge" width="640" height="480"></figure>',
      '<div class="legacy-export-actions flex items-center gap-1">',
      '<button type="button" class="inline-flex items-center rounded-xl">',
      '<img alt="Create Word Docs" width="20" height="20" src="data:image/png;base64,AA==">',
      'Export response as a Word file',
      '</button>',
      '<button type="button" class="inline-flex items-center rounded-xl">',
      '<img alt="Create PDF Docs" width="20" height="20" src="data:image/png;base64,AA==">',
      'Export response as a PDF file',
      '</button>',
      '</div>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/image-only-legacy-actions' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'image-only-legacy-actions');
    const serialized = JSON.stringify(result.content);

    expect(serialized).toContain('Generated gauge');
    expect(serialized).toContain('https://example.test/generated-gauge.png');
    expect(serialized).not.toContain('Create Word Docs');
    expect(serialized).not.toContain('Create PDF Docs');
    expect(serialized).not.toContain('Export response as a Word file');
    expect(serialized).not.toContain('Export response as a PDF file');
    expect(serialized).not.toContain('Inline image fallback');
    expect(result.warnings).toEqual([]);
  });

  it('drops opaque local-reference buttons without losing surrounding prose', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="local-reference-buttons">',
      '<div data-message-content>',
      'Before reference. ',
      '<button type="button" class="ms-1 flex items-center rounded-xl">',
      '<svg width="20" height="20" aria-hidden="true"><use href="/assets/sprite.svg#reference"></use></svg>',
      '<p class="not-prose flex-auto truncate">12345678-1234-1234-1234-123456789…</p>',
      '</button>',
      '<button type="button"><svg aria-hidden="true"></svg>',
      '<p class="not-prose truncate">aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</p></button>',
      '<button type="button"><svg aria-hidden="true"></svg>',
      '<p class="not-prose truncate">abcdefab-cdef-abcd-efab-cdef...</p></button>',
      ' After reference.',
      '</div>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/local-reference-buttons' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'local-reference-buttons');
    const serialized = JSON.stringify(result.content);

    expect(serialized).toContain('Before reference.');
    expect(serialized).toContain('After reference.');
    expect(serialized).not.toContain('12345678-1234-1234-1234');
    expect(serialized).not.toContain('aaaaaaaa-bbbb-cccc-dddd');
    expect(serialized).not.toContain('abcdefab-cdef-abcd-efab');
    expect(serialized).not.toContain('Unsupported button content');
    expect(result.warnings).toEqual([]);
  });

  it('drops pasted-text attachment buttons without losing surrounding prose', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="pasted-text-chip">',
      '<div data-message-content>',
      'Before pasted text. ',
      '<button type="button" class="ms-1 relative flex h-[25px] select-none items-center justify-center gap-1 rounded-xl px-2 text-[10px] leading-[13px] corner-superellipse/1.1 text-token-text-secondary! hover:text-token-text-primary! hover:bg-token-bg-secondary dark:bg-token-main-surface-secondary dark:hover:bg-token-bg-secondary bg-[#f4f4f4] ">',
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="h-[16px] w-[16px] object-contain text-token-text-primary! flex-none icon-sm">',
      '<use href="/cdn/assets/sprites-core-16f983c9.svg#554074" fill="currentColor"></use>',
      '</svg>',
      '<p class="not-prose mt-0! mb-0! flex-auto truncate">粘贴的文本 (1)</p>',
      '</button>',
      ' After pasted text.',
      '</div>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/pasted-text-chip' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'pasted-text-chip');
    const serialized = JSON.stringify(result.content);

    expect(serialized).toContain('Before pasted text.');
    expect(serialized).toContain('After pasted text.');
    expect(serialized).not.toContain('粘贴的文本');
    expect(serialized).not.toContain('Unsupported button content');
    expect(result.warnings).toEqual([]);
  });

  it('drops ChatGPT file attachment chips without re-admitting them as source chips', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="file-attachment-chip">',
      '<div data-message-content>',
      'Before attachment. ',
      '<button type="button" class="ms-1 relative flex h-[25px] select-none items-center justify-center gap-1 rounded-xl px-2 text-[10px] leading-[13px] corner-superellipse/1.1 text-token-text-secondary! bg-[#f4f4f4] ">',
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="h-[16px] w-[16px] object-contain text-token-text-primary! flex-none icon-sm">',
      '<use href="/cdn/assets/sprites-core-16f983c9.svg#554074" fill="currentColor"></use>',
      '</svg>',
      '<p class="not-prose mt-0! mb-0! flex-auto truncate">cv_YuYan_CN</p>',
      '</button>',
      ' After attachment.',
      '</div>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/file-attachment-chip' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'file-attachment-chip');
    const serialized = JSON.stringify(result.content);

    expect(serialized).toContain('Before attachment.');
    expect(serialized).toContain('After attachment.');
    expect(serialized).not.toContain('cv_YuYan_CN');
    expect(serialized).not.toContain('Unsupported button content');
    expect(result.warnings).toEqual([]);
  });

  it('does not warn for KaTeX radical helper SVGs while keeping attachment filtering', () => {
    const radical = [
      '<span class="katex">',
      '<span class="katex-mathml"><math><semantics><mrow><msqrt><mi>D</mi></msqrt></mrow>',
      '<annotation encoding="application/x-tex">\\sqrt{D}</annotation>',
      '</semantics></math></span>',
      '<span class="katex-html" aria-hidden="true"><span class="hide-tail">',
      '<svg xmlns="http://www.w3.org/2000/svg" width="400em" height="1.08em" viewBox="0 0 400000 1080"><path d="M0 0"></path></svg>',
      '</span></span>',
      '</span>',
    ].join('');
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="katex-radical-svg">',
      '<div data-message-content>',
      '<p>Before attachment. ',
      '<button type="button" class="ms-1 rounded-xl">',
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true"><use href="/cdn/assets/sprites-core.svg#554074"></use></svg>',
      '<p class="not-prose flex-auto truncate">pasted markdown (1).md</p>',
      '</button> After attachment.</p>',
      `<p>The first scale is ${radical}.</p>`,
      `<p>The second scale is ${radical}.</p>`,
      '</div>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/katex-radical-svg' }).window.document;
    for (const svg of document.querySelectorAll<SVGElement>('span.katex svg')) {
      svg.getBoundingClientRect = () => ({
        height: 22.208738327026367,
        width: 34.72391128540039,
      } as DOMRect);
    }
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'katex-radical-svg');
    const serialized = JSON.stringify(result.content);
    const mathNodes = walkNodes(result.content).filter((node) => node.kind === 'mathInline');

    expect(mathNodes).toHaveLength(2);
    expect(mathNodes.every((node) => node.kind === 'mathInline'
      && node.source === String.raw`\sqrt{D}`)).toBe(true);
    expect(serialized).toContain('Before attachment.');
    expect(serialized).toContain('After attachment.');
    expect(serialized).not.toContain('pasted markdown');
    expect(serialized).not.toContain('Inline image fallback');
    expect(result.warnings).toEqual([]);
  });

  it('still warns for an SVG in a math-like wrapper without semantic math source', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="invalid-math-svg">',
      '<p>Diagram <span class="katex"><svg aria-label="Research diagram" width="64" height="40"></svg></span>.</p>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/invalid-math-svg' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'invalid-math-svg');

    expect(JSON.stringify(result.content)).toContain('[Inline image fallback: Research diagram]');
    expect(result.warnings).toEqual([{
      code: 'unsupported-content',
      message: 'A nested inline image was preserved as visible fallback text.',
      provenance: {
        stage: 'extraction',
        messageId: 'invalid-math-svg',
        nodePath: [0, 0, 0],
        sourceKind: 'inline-image',
      },
    }]);
  });

  it('ignores textarea and form controls inside fallback message roots', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="form-control-root">',
      '<p>Visible answer.</p>',
      '<form><textarea aria-label="主题">Hidden subject</textarea><input value="Hidden value"><select><option>Hidden option</option></select></form>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/form-control-root' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'form-control-root');
    const serialized = JSON.stringify(result.content);

    expect(serialized).toContain('Visible answer.');
    expect(serialized).not.toContain('Hidden subject');
    expect(serialized).not.toContain('Hidden value');
    expect(serialized).not.toContain('Hidden option');
    expect(serialized).not.toContain('Unsupported textarea content');
    expect(result.warnings).toEqual([]);
  });

  it('limits local-reference filtering to no-link UUID buttons', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="local-reference-safeguards">',
      '<div data-message-content>',
      '<p>Document id 12345678-1234-1234-1234-123456789abc remains prose.</p>',
      '<a href="https://example.test/reference"><svg aria-hidden="true"></svg><span>12345678-1234-1234-1234-123456789abc</span></a>',
      '<button type="button"><svg aria-hidden="true"></svg><p class="not-prose truncate">Research paper</p></button>',
      '</div>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/local-reference-safeguards' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'local-reference-safeguards');
    const serialized = JSON.stringify(result.content);

    expect(serialized).toContain('Document id 12345678-1234-1234-1234-123456789abc remains prose.');
    expect(serialized).toContain('https://example.test/reference');
    expect(serialized).not.toContain('Research paper');
    expect(serialized).toContain('Unsupported button content');
    expect(result.warnings).toEqual([]);
  });

  it('does not mark an ordinary prose hyperlink as a source link', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="ordinary-link">',
      '<p>Read <a href="https://example.test/guide">the detailed guide</a> before continuing.</p>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/ordinary-link' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'ordinary-link');
    const link = walkNodes(result.content).find((node) => node.kind === 'link');

    expect(link).toMatchObject({
      children: [{ kind: 'text', value: 'the detailed guide' }],
      href: 'https://example.test/guide',
      kind: 'link',
    });
    expect(link).not.toHaveProperty('presentation');
  });

  it('keeps warning safeguards for large, meaningful, image-only, and unmeasured images', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="source-image-safeguards">',
      '<p><a href="https://example.test/large"><img data-case="large" alt="" width="128" height="128" src="https://example.test/large.png"><span>Large source</span></a></p>',
      '<p><a href="https://example.test/meaningful"><img data-case="meaningful" alt="Research chart" width="128" height="128" src="https://example.test/chart.png"><span>Chart source</span></a></p>',
      '<p><a href="https://example.test/image-only"><img data-case="image-only" alt="" width="128" height="128" src="https://example.test/photo.png"></a></p>',
      '<p><a href="https://example.test/unmeasured"><img data-case="unmeasured" alt="" width="128" height="128" src="https://example.test/photo.png"><span>Unmeasured source</span></a></p>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/source-image-safeguards' }).window.document;
    const smallRect = { height: 12, width: 12 } as DOMRect;
    const largeRect = { height: 64, width: 64 } as DOMRect;
    document.querySelector<HTMLImageElement>('[data-case="large"]')!.getBoundingClientRect = () => largeRect;
    document.querySelector<HTMLImageElement>('[data-case="meaningful"]')!.getBoundingClientRect = () => smallRect;
    document.querySelector<HTMLImageElement>('[data-case="image-only"]')!.getBoundingClientRect = () => smallRect;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'source-image-safeguards');
    const serialized = JSON.stringify(result.content);

    expect(serialized).toContain('[Inline image fallback: ]');
    expect(serialized).toContain('[Inline image fallback: Research chart]');
    expect(result.warnings.filter(({ message: warning }) =>
      warning === 'A nested inline image was preserved as visible fallback text.'))
      .toHaveLength(4);
  });

  it('still warns when a meaningful inline image appears in ordinary prose', () => {
    const document = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="inline-image">',
      '<p>Here is <img src="https://example.test/chart.png" alt="architecture chart" width="120" height="80"> inline.</p>',
      '</article>',
    ].join(''), { url: 'https://chatgpt.com/c/inline-image' }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    const result = parseMessageContentResult(message, 'inline-image');

    expect(JSON.stringify(result.content)).toContain('[Inline image fallback: architecture chart]');
    expect(result.warnings).toEqual([{
      code: 'unsupported-content',
      message: 'A nested inline image was preserved as visible fallback text.',
      provenance: {
        stage: 'extraction',
        messageId: 'inline-image',
        nodePath: [0, 0],
        sourceKind: 'inline-image',
      },
    }]);
  });

  it('extracts KaTeX-style MathML annotations without duplicating hidden rendered text', () => {
    const blocks = parseAssistant([
      '<article data-message-author-role="assistant">',
      '<p>Inline ',
      '<span class="katex">',
      '<span class="katex-mathml">',
      '<math><semantics>',
      '<msup><mi>E</mi><mn>2</mn></msup>',
      '<annotation encoding="application/x-tex">E^2</annotation>',
      '</semantics></math>',
      '</span>',
      '<span class="katex-html" aria-hidden="true">hidden duplicate E2</span>',
      '</span>',
      ' done.</p>',
      '<div class="katex-display">',
      '<span class="katex">',
      '<span class="katex-mathml">',
      '<math><semantics>',
      '<mfrac><mi>a</mi><mi>b</mi></mfrac>',
      '<annotation encoding="application/x-tex">\\frac{a}{b}</annotation>',
      '</semantics></math>',
      '</span>',
      '<span class="katex-html" aria-hidden="true">hidden duplicate a/b</span>',
      '</span>',
      '</div>',
      '</article>',
    ].join(''));

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      children: [
        { kind: 'text', value: 'Inline ' },
        {
          fallbackText: 'E²',
          kind: 'mathInline',
          provenance: 'explicit',
          source: 'E^2',
          sourceFormat: 'tex',
        },
        { kind: 'text', value: ' done.' },
      ],
      kind: 'paragraph',
    });
    expect(blocks[1]).toEqual({
      fallbackText: 'a/b',
      kind: 'mathBlock',
      provenance: 'explicit',
      source: '\\frac{a}{b}',
      sourceFormat: 'tex',
    });
    expect(JSON.stringify(blocks)).not.toContain('hidden duplicate');
  });

  it('preserves reduced real-world mixed math, text-figure lines, and content isolation', () => {
    const document = new JSDOM(m11ReducedHtml, {
      url: 'https://chatgpt.com/c/m11-reduced',
    }).window.document;
    const message = document.querySelector<HTMLElement>('[data-message-id="m11-reduced"]')!;

    const result = parseMessageContentResult(message, 'm11-reduced');
    const blockquote = result.content[0];
    const codeBlock = result.content[1];

    expect(blockquote).toEqual({
      kind: 'blockquote',
      children: [{
        kind: 'paragraph',
        children: [{
          kind: 'strong',
          children: [
            { kind: 'text', value: 'Show ' },
            {
              kind: 'mathInline',
              provenance: 'explicit',
              source: 'T_m^\\alpha',
              sourceFormat: 'tex',
              fallbackText: 'Tmalpha',
            },
            { kind: 'text', value: ', ' },
            {
              kind: 'mathInline',
              provenance: 'explicit',
              source: 'R_{UA}',
              sourceFormat: 'tex',
              fallbackText: 'RUA',
            },
            { kind: 'text', value: ' and ' },
            {
              kind: 'mathInline',
              provenance: 'explicit',
              source: 'Z_{int}',
              sourceFormat: 'tex',
              fallbackText: 'Zint',
            },
            { kind: 'text', value: '.' },
          ],
        }],
      }],
    });
    expect(codeBlock).toEqual({
      kind: 'codeBlock',
      presentation: 'textFigure',
      value: '┌── aircraft ✈\n│  △ point\n└── tab:\tvalue',
    });
    expect(JSON.stringify(result.content)).not.toContain('draft');
    expect(JSON.stringify(result.content)).not.toContain('Copy');
    expect(result.warnings).toEqual([{
      code: 'unsupported-content',
      message: 'Unsupported <future-widget> content was preserved with a visible fallback.',
      provenance: {
        stage: 'extraction',
        messageId: 'm11-reduced',
        nodePath: [2, 0],
        sourceKind: 'future-widget',
      },
    }]);
  });

  it('infers only strong plain-text math and preserves text-figure intent', () => {
    const blocks = parseAssistant(m12SemanticHtml);
    const nodes = walkNodes(blocks);
    const inferred = nodes.filter((node) =>
      node.kind === 'mathInline' && node.provenance === 'inferred');
    const text = nodes
      .filter((node) => node.kind === 'text')
      .map((node) => node.kind === 'text' ? node.value : '')
      .join('');
    const preformatted = blocks.filter((node) => node.kind === 'codeBlock');

    expect(inferred).toEqual([
      {
        fallbackText: 'τ∈[0,H]',
        kind: 'mathInline',
        provenance: 'inferred',
        source: 'τ∈[0,H]',
        sourceFormat: 'tex',
      },
      {
        fallbackText: 'τ∈[0,H]',
        kind: 'mathInline',
        provenance: 'inferred',
        source: 'τ∈[0,H]',
        sourceFormat: 'tex',
      },
      {
        fallbackText: 'Z_int↓q=3',
        kind: 'mathInline',
        provenance: 'inferred',
        source: 'Z_{int}↓q=3',
        sourceFormat: 'tex',
      },
      {
        fallbackText: 'release/hold/v_u(t)',
        kind: 'mathInline',
        provenance: 'inferred',
        source: 'release/hold/v_u(t)',
        sourceFormat: 'tex',
      },
      {
        fallbackText: 'τ∈[0,H]',
        kind: 'mathInline',
        provenance: 'inferred',
        source: 'τ∈[0,H]',
        sourceFormat: 'tex',
      },
    ]);
    expect(text).toContain('version 2.9.0');
    expect(text).toContain('2026-06-28');
    expect(text).toContain('https://example.com/a/b');
    expect(text).toContain('A/B testing');
    expect(text).toContain('x = prose');
    expect(blocks[1]).toEqual({
      kind: 'paragraph',
      children: [
        { kind: 'text', value: 'Middle window ' },
        {
          fallbackText: 'τ∈[0,H]',
          kind: 'mathInline',
          provenance: 'inferred',
          source: 'τ∈[0,H]',
          sourceFormat: 'tex',
        },
        { kind: 'text', value: ' precedes ' },
        {
          fallbackText: 'Z_int↓q=3',
          kind: 'mathInline',
          provenance: 'inferred',
          source: 'Z_{int}↓q=3',
          sourceFormat: 'tex',
        },
        { kind: 'text', value: '，and remains ordered.' },
      ],
    });
    expect(preformatted.map((block) => {
      if (block.kind !== 'codeBlock') return block;
      const stripped = { ...block };
      delete stripped.mathTokens;
      return stripped;
    })).toEqual([
      {
        kind: 'codeBlock',
        presentation: 'textFigure',
        value: '┌──── local overlap\n│  ● → ■\n└──── R_UA',
      },
      {
        kind: 'codeBlock',
        language: 'typescript',
        presentation: 'code',
        value: 'const ratio = left / right;\nconsole.log(ratio);',
      },
    ]);
  });

  it('classifies structural diagrams as text figures even when ChatGPT wraps them in a language code block', () => {
    const blocks = parseAssistant([
      '<article data-message-author-role="assistant">',
      '<div class="markdown"><pre><code class="language-text">',
      'local overlap\n',
      'blue ellipse  -> q=1\n',
      'green box     -> q=2\n',
      'control action -> release/hold\n',
      'Z_int -> q=3',
      '</code></pre></div>',
      '</article>',
    ].join(''));

    expect(blocks).toEqual([{
      kind: 'codeBlock',
      language: 'text',
      presentation: 'textFigure',
      value: [
        'local overlap',
        'blue ellipse  -> q=1',
        'green box     -> q=2',
        'control action -> release/hold',
        'Z_int -> q=3',
      ].join('\n'),
    }]);
  });

  it('infers formulas split across formatted inline DOM while keeping negative controls as text', () => {
    const blocks = parseAssistant([
      '<article data-message-author-role="assistant">',
      '<p>Terminal interval <em>&tau;</em><span>&isin;</span><span>[0,H]</span> should be math.</p>',
      '<p>Spaced terminal interval <em>&tau;</em> <span>&isin;</span> <span>[0,H]</span> should be math.</p>',
      '<p>NBSP terminal interval <em>&tau;</em>&nbsp;<span>&isin;</span>&nbsp;<span>[0,H]</span> should be math.</p>',
      '<p>Zero-width terminal interval <em>&tau;</em>&#8203;<span>&isin;</span>&#8203;<span>[0,H]</span> should be math.</p>',
      '<p>Controls: <em>ordinary emphasis</em>, version <em>2.9.0</em>, ',
      '<span>2026-06-30</span>, <a href="https://example.com/a/b">https://example.com/a/b</a>, ',
      '<em>x = prose</em>.</p>',
      '</article>',
    ].join(''));
    const nodes = walkNodes(blocks);
    const math = nodes.filter((node) => node.kind === 'mathInline');
    const text = nodes
      .filter((node) => node.kind === 'text')
      .map((node) => node.kind === 'text' ? node.value : '')
      .join(' ');
    const emphasis = nodes.filter((node) => node.kind === 'emphasis');

    expect(math).toEqual(Array.from({ length: 4 }, () => ({
      fallbackText: '\u03c4\u2208[0,H]',
      kind: 'mathInline',
      provenance: 'inferred',
      source: '\u03c4\u2208[0,H]',
      sourceFormat: 'tex',
    })));
    expect(text).toContain('Terminal interval');
    expect(text).toContain('Spaced terminal interval');
    expect(text).toContain('NBSP terminal interval');
    expect(text).toContain('Zero-width terminal interval');
    expect(text).toContain('should be math.');
    expect(text).toContain('2026-06-30');
    expect(JSON.stringify(emphasis)).toContain('ordinary emphasis');
    expect(JSON.stringify(emphasis)).toContain('2.9.0');
    expect(JSON.stringify(emphasis)).toContain('x = prose');
    expect(JSON.stringify(math)).not.toContain('2.9.0');
    expect(JSON.stringify(math)).not.toContain('2026-06-30');
    expect(JSON.stringify(math)).not.toContain('https://example.com/a/b');
  });

  it('falls back to browser visible text when preformatted child serialization is empty', () => {
    const dom = new JSDOM([
      '<article data-message-author-role="assistant">',
      '<pre><code><span data-layout-only="true"></span></code></pre>',
      '</article>',
    ].join(''));
    const article = dom.window.document.querySelector<HTMLElement>('article')!;
    const code = dom.window.document.querySelector<HTMLElement>('code')!;
    Object.defineProperty(code, 'innerText', {
      configurable: true,
      value: '┌──── local overlap\n│  ● → ■\n└──── Z_int',
    });

    const result = parseMessageContentResult(article, 'pre-fallback');

    expect(result.content).toContainEqual({
      kind: 'codeBlock',
      presentation: 'textFigure',
      value: '┌──── local overlap\n│  ● → ■\n└──── Z_int',
    });
  });
});
