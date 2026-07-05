import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWordClipboardPayload,
  mountWordClipboardIntegration,
} from '../../src/clipboard/word-clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

function installDom(html: string): JSDOM {
  const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/clipboard' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  return dom;
}

function selectElement(document: Document, selector: string): Selection {
  const target = document.querySelector(selector);
  if (!target) throw new Error(`Missing target: ${selector}`);
  const range = document.createRange();
  range.selectNodeContents(target);
  const selection = document.defaultView!.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

describe('Word-friendly clipboard payload', () => {
  it('copies selected ChatGPT content as HTML with semantic MathML', () => {
    const dom = installDom([
      '<main>',
      '<article data-message-author-role="assistant" data-message-id="assistant-1">',
      '<div class="markdown prose">',
      '<p>Formula ',
      '<span class="katex">',
      '<span class="katex-mathml">',
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics>',
      '<mrow><msup><mi>x</mi><mn>2</mn></msup></mrow>',
      '<annotation encoding="application/x-tex">x^2</annotation>',
      '</semantics></math>',
      '</span>',
      '<span class="katex-html" aria-hidden="true">rendered x squared</span>',
      '</span>',
      '</p>',
      '<button data-chat-export-format="docx">W</button>',
      '</div>',
      '</article>',
      '</main>',
    ].join(''));

    const payload = createWordClipboardPayload(selectElement(dom.window.document, '.markdown'));

    expect(payload?.text).toContain('Formula');
    expect(payload?.html).toContain('<math');
    expect(payload?.html).toContain('<msup>');
    expect(payload?.html).not.toContain('katex-html');
    expect(payload?.html).not.toContain('annotation');
    expect(payload?.html).not.toContain('data-chat-export-format');
  });

  it('does not override copy outside a single ChatGPT message', () => {
    const dom = installDom('<main><p id="plain">Outside</p></main>');

    const payload = createWordClipboardPayload(selectElement(dom.window.document, '#plain'));

    expect(payload).toBeNull();
  });

  it('preserves the portable mixed-math compatibility corpus', () => {
    const fixture = readFileSync(
      new URL('../fixtures/clipboard/word-math-corpus.html', import.meta.url),
      'utf8',
    );
    const dom = installDom(fixture);

    const payload = createWordClipboardPayload(selectElement(dom.window.document, 'article'));

    expect(payload).not.toBeNull();
    expect(payload?.html.match(/<math(?:\s|>)/g)).toHaveLength(8);
    expect(payload?.html).toContain('<munderover>');
    expect(payload?.html).toContain('<mtable>');
    expect(payload?.html).toContain('概率');
  });

  it('keeps a 100-formula selection bounded to the selected message', () => {
    const formulas = Array.from({ length: 100 }, (_, index) => [
      '<p>',
      `<span>Formula ${index + 1}: </span>`,
      '<span class="katex">',
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics>',
      `<mrow><msub><mi>x</mi><mn>${index + 1}</mn></msub></mrow>`,
      `<annotation encoding="application/x-tex">x_${index + 1}</annotation>`,
      '</semantics></math>',
      '<span class="katex-html" aria-hidden="true">visual formula</span>',
      '</span>',
      '</p>',
    ].join('')).join('');
    const dom = installDom([
      '<main>',
      '<article data-message-author-role="assistant" data-message-id="stress">',
      `<div class="markdown prose">${formulas}</div>`,
      '</article>',
      '<article data-message-author-role="assistant" data-message-id="outside">Outside</article>',
      '</main>',
    ].join(''));

    const payload = createWordClipboardPayload(selectElement(dom.window.document, '.markdown'));

    expect(payload?.html.match(/<math(?:\s|>)/g)).toHaveLength(100);
    expect(payload?.html).not.toContain('annotation');
    expect(payload?.html).not.toContain('visual formula');
    expect(payload?.html).not.toContain('Outside');
  });

  it('does not override a selection spanning multiple ChatGPT messages', () => {
    const dom = installDom([
      '<main>',
      '<article data-message-author-role="assistant" data-message-id="one"><p id="one">One</p></article>',
      '<article data-message-author-role="assistant" data-message-id="two"><p id="two">Two</p></article>',
      '</main>',
    ].join(''));
    const document = dom.window.document;
    const range = document.createRange();
    range.setStart(document.querySelector('#one')!.firstChild!, 0);
    range.setEnd(document.querySelector('#two')!.firstChild!, 3);
    const selection = document.defaultView!.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(createWordClipboardPayload(selection)).toBeNull();
  });

  it('handles copy in window capture phase before page handlers can overwrite it', () => {
    const dom = installDom([
      '<main>',
      '<article data-message-author-role="assistant" data-message-id="assistant-1">',
      '<div class="markdown prose">',
      '<p id="target">Formula ',
      '<span class="katex">',
      '<span class="katex-mathml">',
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics>',
      '<mrow><msup><mi>x</mi><mn>2</mn></msup></mrow>',
      '<annotation encoding="application/x-tex">x^2</annotation>',
      '</semantics></math>',
      '</span>',
      '<span class="katex-html" aria-hidden="true">rendered x squared</span>',
      '</span>',
      '</p>',
      '</div>',
      '</article>',
      '</main>',
    ].join(''));
    const document = dom.window.document;
    const stopPropagation = vi.fn((event: Event) => event.stopPropagation());
    document.querySelector('#target')!.addEventListener('copy', stopPropagation);
    const cleanup = mountWordClipboardIntegration(document);
    const clipboard = {
      values: new Map<string, string>(),
      setData(type: string, value: string) {
        this.values.set(type, value);
      },
    };

    selectElement(document, '#target');
    const event = new dom.window.Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboard });
    document.querySelector('#target')!.dispatchEvent(event);
    cleanup();

    expect(stopPropagation).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(clipboard.values.get('text/html')).toContain('<math');
    expect(clipboard.values.get('text/html')).not.toContain('katex-html');
    expect(clipboard.values.get('text/html')).not.toContain('annotation');
    expect(clipboard.values.get('text/plain')).toContain('Formula');
  });

  it('notifies the optional integration only after preserving the Word payload', async () => {
    const dom = installDom([
      '<article data-message-author-role="assistant" data-message-id="assistant-1">',
      '<p id="target">Formula <math><mi>x</mi></math></p>',
      '</article>',
    ].join(''));
    const document = dom.window.document;
    const copied = vi.fn();
    const cleanup = mountWordClipboardIntegration(document, { onCopied: copied });
    const clipboard = {
      values: new Map<string, string>(),
      setData(type: string, value: string) {
        this.values.set(type, value);
      },
    };

    selectElement(document, '#target');
    const event = new dom.window.Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboard });
    document.querySelector('#target')!.dispatchEvent(event);
    await Promise.resolve();
    cleanup();

    expect(clipboard.values.get('text/html')).toContain('<math');
    expect(clipboard.values.get('text/plain')).toContain('Formula');
    expect(copied).toHaveBeenCalledOnce();
    expect(copied.mock.calls[0]?.[0]).toEqual({
      html: clipboard.values.get('text/html'),
      text: clipboard.values.get('text/plain'),
    });
  });
});
