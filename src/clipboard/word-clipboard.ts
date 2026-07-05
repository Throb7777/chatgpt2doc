import { CHATGPT_SELECTORS } from '../platform/chatgpt/selectors';

export interface WordClipboardPayload {
  html: string;
  text: string;
}

export interface WordClipboardIntegrationOptions {
  onCopied?: (payload: WordClipboardPayload) => void | Promise<void>;
}

const NON_CONTENT_SELECTOR = [
  CHATGPT_SELECTORS.extensionUi,
  CHATGPT_SELECTORS.messageNonContent,
  '[aria-hidden="true"]',
  '[hidden]',
].join(', ');

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const element = target as HTMLElement;
  return Boolean(
    element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'),
  );
}

function selectedMessageRoot(selection: Selection): Element | null {
  const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
    ? selection.anchorNode as Element
    : selection.anchorNode?.parentElement;
  const focus = selection.focusNode?.nodeType === Node.ELEMENT_NODE
    ? selection.focusNode as Element
    : selection.focusNode?.parentElement;
  const anchorMessage = anchor?.closest(CHATGPT_SELECTORS.message) ?? null;
  const focusMessage = focus?.closest(CHATGPT_SELECTORS.message) ?? null;
  if (!anchorMessage || !focusMessage || anchorMessage !== focusMessage) return null;
  if (anchor?.closest(CHATGPT_SELECTORS.extensionUi) || focus?.closest(CHATGPT_SELECTORS.extensionUi)) {
    return null;
  }
  return anchorMessage;
}

function removeNonContent(root: ParentNode): void {
  for (const element of [...root.querySelectorAll(NON_CONTENT_SELECTOR)]) {
    element.remove();
  }
}

function replaceKatexWithMath(root: ParentNode): void {
  for (const katex of [...root.querySelectorAll('.katex')]) {
    const math = katex.querySelector('math');
    if (!math) continue;
    const replacement = math.cloneNode(true);
    katex.replaceWith(replacement);
  }
}

function stripMathAnnotations(root: ParentNode): void {
  for (const annotation of [...root.querySelectorAll('annotation')]) {
    annotation.remove();
  }
}

function normalizeLinks(root: ParentNode, baseURI: string): void {
  for (const link of [...root.querySelectorAll<HTMLAnchorElement>('a[href]')]) {
    const href = link.getAttribute('href');
    if (!href) continue;
    try {
      link.href = new URL(href, baseURI).href;
    } catch {
      // Keep the existing href when URL normalization is unavailable.
    }
  }
}

function sanitizeFragment(fragment: DocumentFragment): HTMLElement {
  const owner = fragment.ownerDocument;
  const wrapper = owner.createElement('div');
  wrapper.append(fragment.cloneNode(true));
  removeNonContent(wrapper);
  replaceKatexWithMath(wrapper);
  stripMathAnnotations(wrapper);
  normalizeLinks(wrapper, owner.baseURI);
  return wrapper;
}

function htmlDocument(fragmentHtml: string): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="utf-8"></head>',
    '<body>',
    '<!--StartFragment-->',
    fragmentHtml,
    '<!--EndFragment-->',
    '</body>',
    '</html>',
  ].join('');
}

export function createWordClipboardPayload(selection: Selection): WordClipboardPayload | null {
  if (selection.isCollapsed || selection.rangeCount === 0) return null;
  if (!selectedMessageRoot(selection)) return null;
  const fragment = selection.getRangeAt(0).cloneContents();
  const sanitized = sanitizeFragment(fragment);
  const html = sanitized.innerHTML.trim();
  const text = selection.toString();
  if (!html || !text.trim()) return null;
  return {
    html: htmlDocument(html),
    text,
  };
}

export function mountWordClipboardIntegration(
  document: Document,
  options: WordClipboardIntegrationOptions = {},
): () => void {
  const onCopy = (event: Event) => {
    const clipboardEvent = event as ClipboardEvent;
    if (isEditableTarget(event.target) || !clipboardEvent.clipboardData) return;
    const selection = document.defaultView?.getSelection();
    if (!selection) return;
    const payload = createWordClipboardPayload(selection);
    if (!payload) return;
    clipboardEvent.clipboardData.setData('text/plain', payload.text);
    clipboardEvent.clipboardData.setData('text/html', payload.html);
    event.preventDefault();
    event.stopImmediatePropagation();
    if (options.onCopied) {
      void Promise.resolve(options.onCopied(payload)).catch(() => undefined);
    }
  };
  const target = document.defaultView ?? document;
  target.addEventListener('copy', onCopy, true);
  return () => target.removeEventListener('copy', onCopy, true);
}
