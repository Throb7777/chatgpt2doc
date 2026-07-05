import { readFileSync } from 'node:fs';

import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWordClipboardPayload } from '../../../src/clipboard/word-clipboard';
import { createWpsClipboardDocument } from '../../../src/integrations/wps/wps-document';
import { DEFAULT_UI_SETTINGS } from '../../../src/settings/settings';

afterEach(() => vi.unstubAllGlobals());

describe('WPS clipboard document', () => {
  it('reuses selected semantic content to create a DOCX/OMML package', async () => {
    const fixture = readFileSync(
      new URL('../../fixtures/clipboard/word-math-corpus.html', import.meta.url),
      'utf8',
    );
    const dom = new JSDOM(fixture, { url: 'https://chatgpt.com/c/wps-package' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('DOMParser', dom.window.DOMParser);

    const article = dom.window.document.querySelector('article')!;
    const range = dom.window.document.createRange();
    range.selectNodeContents(article);
    const selection = dom.window.getSelection()!;
    selection.addRange(range);
    const payload = createWordClipboardPayload(selection)!;

    const encoded = await createWpsClipboardDocument(
      dom.window.document,
      payload,
      DEFAULT_UI_SETTINGS,
    );
    const zip = await JSZip.loadAsync(Buffer.from(encoded, 'base64'));
    const xml = await zip.file('word/document.xml')!.async('string');
    const settings = await zip.file('word/settings.xml')!.async('string');
    const styles = await zip.file('word/styles.xml')!.async('string');

    expect(xml).toContain('<w:document');
    expect(xml).toContain('<m:oMath');
    expect(xml).toContain('<m:sty m:val="p"/>');
    expect(xml).toContain('w:ascii="Cambria Math"');
    expect(xml).toMatch(
      /<m:r><m:rPr><m:sty m:val="p"\/><\/m:rPr><w:rPr><w:rFonts[^>]+w:ascii="Cambria Math"[^>]+\/><\/w:rPr><m:t>2<\/m:t><\/m:r>/u,
    );
    expect(xml).toMatch(
      /<m:r><w:rPr><w:rFonts[^>]+w:ascii="Cambria Math"[^>]+\/><\/w:rPr><m:t>x<\/m:t><\/m:r>/u,
    );
    expect(xml).not.toContain('Unsupported equation');
    expect(settings).toContain('<m:mathFont m:val="Cambria Math"/>');
    expect(styles).toContain('w:ascii="Arial"');
    expect(styles).toContain('w:hAnsi="Arial"');
    expect(styles).toContain('w:eastAsia="Microsoft YaHei"');
    expect(styles).toContain('w:after="80"');
    expect(styles).not.toContain('w:ascii="Noto Serif"');
  });

  it('keeps KaTeX mstyle cases as editable OMML after annotations are stripped', async () => {
    const math = [
      '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow>',
      '<msub><mi>y</mi><mrow><mi>t</mi><mo>+</mo><mn>1</mn></mrow></msub><mo>=</mo>',
      '<mrow><mo fence="true">{</mo><mtable rowspacing="0.36em" columnalign="left left" columnspacing="1em">',
      '<mtr><mtd><mstyle scriptlevel="0" displaystyle="false"><mrow>',
      '<msub><mi>f</mi><mn>0</mn></msub><mo stretchy="false">(</mo><msub><mi>y</mi><mi>t</mi></msub><mo stretchy="false">)</mo><mo separator="true">,</mo>',
      '</mrow></mstyle></mtd><mtd><mstyle scriptlevel="0" displaystyle="false"><mrow>',
      '<msub><mi>ω</mi><mi>t</mi></msub><mo>=</mo><mn>0</mn>',
      '</mrow></mstyle></mtd></mtr>',
      '<mtr><mtd><mstyle scriptlevel="0" displaystyle="false"><mrow>',
      '<msub><mi>f</mi><mn>1</mn></msub><mo stretchy="false">(</mo><msub><mi>u</mi><mi>t</mi></msub><mo separator="true">,</mo><msub><mi>y</mi><mi>t</mi></msub><mo separator="true">,</mo><msub><mi>a</mi><mi>t</mi></msub><mo stretchy="false">)</mo><mo separator="true">,</mo>',
      '</mrow></mstyle></mtd><mtd><mstyle scriptlevel="0" displaystyle="false"><mrow>',
      '<msub><mi>ω</mi><mi>t</mi></msub><mo>=</mo><mn>1</mn>',
      '</mrow></mstyle></mtd></mtr>',
      '</mtable></mrow></mrow><annotation encoding="application/x-tex">piecewise-source</annotation></semantics></math>',
    ].join('');
    const dom = new JSDOM([
      '<article data-message-author-role="assistant" data-message-id="wps-cases">',
      '<div class="markdown"><span class="katex">',
      math,
      '<span class="katex-html" aria-hidden="true">rendered piecewise formula</span>',
      '</span></div></article>',
    ].join(''), { url: 'https://chatgpt.com/c/wps-cases' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('DOMParser', dom.window.DOMParser);
    const range = dom.window.document.createRange();
    range.selectNodeContents(dom.window.document.querySelector('.markdown')!);
    const selection = dom.window.getSelection()!;
    selection.addRange(range);
    const payload = createWordClipboardPayload(selection)!;

    expect(payload.html).not.toContain('annotation');
    expect(payload.html).not.toContain('katex-html');
    const encoded = await createWpsClipboardDocument(
      dom.window.document,
      payload,
      DEFAULT_UI_SETTINGS,
    );
    const zip = await JSZip.loadAsync(Buffer.from(encoded, 'base64'));
    const xml = await zip.file('word/document.xml')!.async('string');

    expect(xml).toContain('<m:m>');
    expect(xml).toContain('<m:sSub>');
    expect(xml).toContain('<m:begChr m:val="{"/>');
    expect(xml).toContain('<m:endChr m:val=""/>');
    expect(xml).not.toContain('Unsupported equation');
  });
});
