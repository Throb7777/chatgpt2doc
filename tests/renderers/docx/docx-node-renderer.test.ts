import { readFile } from 'node:fs/promises';
import path from 'node:path';

import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import type { ChatDocument } from '../../../src/document/ast';
import type { ExportRequest } from '../../../src/document/export';
import { parseMessageContentResult } from '../../../src/platform/chatgpt/content-parser';
import {
  renderDocxMessageContent,
  renderStructuredDocx,
  renderStructuredDocxBlob,
} from '../../../src/renderers/docx/docx-node-renderer';

const documentFixture: ChatDocument = {
  version: 1,
  title: 'Structured DOCX Fixture',
  source: {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/structured-docx',
    capturedAt: '2026-06-22T07:00:00.000Z',
  },
  exportedAt: '2026-06-22T07:01:00.000Z',
  messages: [
    {
      id: 'user-1',
      role: 'user',
      order: 0,
      selected: false,
      status: 'complete',
      content: [{
        kind: 'paragraph',
        children: [{ kind: 'text', value: 'User prompt' }],
      }],
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      order: 1,
      selected: true,
      status: 'complete',
      content: [
        {
          kind: 'heading',
          level: 1,
          children: [{ kind: 'text', value: 'Rich structures' }],
        },
        {
          kind: 'paragraph',
          children: [
            { kind: 'text', value: 'Plain ' },
            { kind: 'strong', children: [{ kind: 'text', value: 'bold' }] },
            { kind: 'text', value: ' and ' },
            { kind: 'emphasis', children: [{ kind: 'text', value: 'italic' }] },
            { kind: 'lineBreak' },
            { kind: 'inlineCode', value: '<tag>' },
            {
              kind: 'link',
              href: 'https://example.com',
              children: [{ kind: 'text', value: 'Example link' }],
            },
            {
              kind: 'link',
              href: 'https://www.haodf.com/doctor/155984.html',
              children: [{ kind: 'text', value: '好大夫在线' }],
              presentation: 'source',
            },
            {
              kind: 'citation',
              href: 'https://example.com/citation',
              label: '[1]',
            },
          ],
        },
        {
          kind: 'blockquote',
          children: [{
            kind: 'paragraph',
            children: [{ kind: 'text', value: 'Quoted text' }],
          }],
        },
        {
          kind: 'orderedList',
          start: 4,
          items: [
            { children: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'First' }] }] },
            { children: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'Second' }] }] },
          ],
        },
        {
          kind: 'unorderedList',
          items: [{
            children: [
              { kind: 'paragraph', children: [{ kind: 'text', value: 'Outer' }] },
              {
                kind: 'unorderedList',
                items: [{
                  children: [{
                    kind: 'paragraph',
                    children: [{ kind: 'text', value: 'Nested' }],
                  }],
                }],
              },
            ],
          }],
        },
        {
          kind: 'table',
          header: {
            cells: [
              { children: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'Name' }] }] },
              { children: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'Value' }] }] },
            ],
          },
          rows: [{
            cells: [
              { children: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'Alpha' }] }] },
              {
                alignment: 'right',
                children: [{
                  kind: 'paragraph',
                  children: [{ kind: 'text', value: 'Aligned' }],
                }],
              },
            ],
          }],
        },
        {
          kind: 'codeBlock',
          language: 'typescript',
          value: 'const escaped = "<>&";\nreturn escaped;',
        },
        { kind: 'separator' },
        {
          kind: 'mathBlock',
          source: '\\frac{1}{2}',
          sourceFormat: 'tex',
          fallbackText: '1/2',
        },
        {
          kind: 'image',
          source: { kind: 'url', value: 'https://example.com/chart.svg' },
          alt: 'Synthetic chart',
          fallbackHref: 'https://example.com/chart.svg',
        },
        { kind: 'pageBreak' },
        {
          kind: 'paragraph',
          children: [{ kind: 'text', value: 'After page break' }],
        },
      ],
    },
  ],
  warnings: [],
};

function request(
  selection: ExportRequest['selection'] = { scope: 'full-conversation' },
  includePrompts = true,
): ExportRequest {
  return {
    document: documentFixture,
    selection,
    options: {
      codeStyle: 'document',
      fileName: 'structured-docx',
      format: 'docx',
      includePrompts,
      language: 'en',
      paper: 'a4',
      theme: 'light',
    },
  };
}

async function packageParts(blob: Blob): Promise<{
  documentXml: string;
  numbering: string;
  relationships: string;
  styles: string;
}> {
  const archive = await JSZip.loadAsync(await blob.arrayBuffer());
  const read = async (path: string) => {
    const entry = archive.file(path);
    if (!entry) throw new Error(`Missing OOXML part: ${path}`);
    return entry.async('string');
  };
  return {
    documentXml: await read('word/document.xml'),
    numbering: await read('word/numbering.xml'),
    relationships: await read('word/_rels/document.xml.rels'),
    styles: await read('word/styles.xml'),
  };
}

describe('DOCX structural and rich-text renderer', () => {
  it('maps supported AST structures into editable Word OOXML', async () => {
    const { documentXml, numbering, relationships, styles } = await packageParts(
      await renderStructuredDocxBlob(request()),
    );

    expect(documentXml).toContain('User prompt');
    expect(documentXml).toContain('Rich structures');
    expect(documentXml).toContain('<w:b/>');
    expect(documentXml).toContain('<w:i/>');
    expect(documentXml).toContain('<w:br/>');
    expect(documentXml).toContain('&lt;tag&gt;');
    expect(documentXml).toContain('<w:hyperlink');
    expect(relationships).toContain('Target="https://example.com"');
    expect(relationships).toContain('Target="https://www.haodf.com/doctor/155984.html"');
    expect(relationships).toContain('Target="https://example.com/citation"');
    const sourceHyperlink = documentXml.match(
      /<w:hyperlink[^>]*>[\s\S]*?好大夫在线[\s\S]*?<\/w:hyperlink>/u,
    )?.[0];
    expect(sourceHyperlink).toBeDefined();
    expect(sourceHyperlink).toContain('(');
    expect(sourceHyperlink).toContain(')');
    expect(sourceHyperlink).toContain('w:color w:val="1E4FBC"');
    expect(sourceHyperlink).toContain('w:sz w:val="20"');
    const ordinaryHyperlink = documentXml.match(
      /<w:hyperlink[^>]*>[\s\S]*?Example link[\s\S]*?<\/w:hyperlink>/u,
    )?.[0];
    expect(ordinaryHyperlink).not.toContain('w:color w:val="1E4FBC"');
    expect(ordinaryHyperlink).not.toContain('w:sz w:val="20"');
    expect(documentXml).toContain('w:pStyle w:val="ChatExportQuote"');
    expect(documentXml).toContain('<w:numPr>');
    expect(numbering).toContain('<w:start w:val="4"/>');
    expect(documentXml).toContain('<w:tbl>');
    expect(documentXml).toContain('w:tblHeader');
    expect(documentXml).toContain('<w:jc w:val="right"/>');
    expect(documentXml).toContain('const escaped = &quot;&lt;&gt;&amp;&quot;;');
    expect(documentXml).toContain('return escaped;');
    expect(documentXml).toContain('w:pStyle w:val="ChatExportCode"');
    const quoteStyle = styles.match(
      /<w:style[^>]+w:styleId="ChatExportQuote"[\s\S]*?<\/w:style>/u,
    )?.[0];
    expect(quoteStyle).toBeDefined();
    expect(quoteStyle).not.toContain('<w:pBdr>');
    expect(quoteStyle).not.toContain('<w:i/>');
    expect(documentXml).toContain('<m:f>');
    expect(documentXml).toContain('[Image unavailable: Synthetic chart]');
    expect(documentXml).toContain('w:type="page"');
    expect(documentXml).toContain('After page break');
    expect(styles).toContain('w:styleId="ChatExportQuote"');
    expect(styles).toContain('w:styleId="ChatExportCode"');
  });

  it('honors all message scopes and prompt exclusion in source order', () => {
    expect(renderDocxMessageContent(request()).length).toBeGreaterThan(
      renderDocxMessageContent(request({ scope: 'assistant-only' })).length,
    );
    expect(renderDocxMessageContent(request({ scope: 'full-conversation' }, false))).toHaveLength(
      renderDocxMessageContent(request({ scope: 'assistant-only' })).length,
    );
    expect(renderDocxMessageContent(request({
      scope: 'single-response',
      messageId: 'assistant-1',
    })).length).toBeLessThan(renderDocxMessageContent(request({
      scope: 'selected-messages',
      messageIds: ['assistant-1'],
    })).length);
    expect(renderDocxMessageContent(request({
      scope: 'selected-messages',
      messageIds: ['missing'],
    }))).toHaveLength(0);
  });

  it('renders the reduced real-world single response without synthetic chrome', async () => {
    const fixturePath = path.resolve('tests/fixtures/chatgpt/m11-real-world-reduced.html');
    const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
      url: 'https://chatgpt.com/c/m11-reduced',
    });
    const assistant = dom.window.document.querySelector<HTMLElement>(
      '[data-message-id="m11-reduced"]',
    )!;
    const parsed = parseMessageContentResult(assistant, 'm11-reduced');
    const fixtureRequest = request({
      scope: 'single-response',
      messageId: 'assistant-1',
    });
    fixtureRequest.document = {
      ...fixtureRequest.document,
      messages: [{
        ...fixtureRequest.document.messages[1]!,
        content: parsed.content,
      }],
      warnings: parsed.warnings,
    };
    fixtureRequest.options.codeStyle = 'dark';

    const { documentXml, styles } = await packageParts(
      await renderStructuredDocxBlob(fixtureRequest),
    );

    for (const text of ['Show ', ' and ', 'aircraft', 'point', 'tail.']) {
      expect(documentXml).toContain(text);
    }
    expect(documentXml.match(/<m:oMath>/gu)).toHaveLength(3);
    expect(documentXml.match(/<w:br\/>/gu)).toHaveLength(2);
    expect(documentXml).toContain('<w:tab/>');
    expect(documentXml).toContain('Cascadia Mono');
    expect(documentXml).not.toContain('Structured DOCX Fixture');
    expect(documentXml).not.toContain('Assistant');
    expect(documentXml).not.toContain('draft');
    expect(styles).toContain('w:fill="1F2937"');
    expect(styles).toContain('w:color w:val="F9FAFB"');
  });

  it('renders M12 inferred math and text figures as native Word structures', async () => {
    const fixturePath = path.resolve('tests/fixtures/chatgpt/m12-semantic-boundaries.html');
    const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
      url: 'https://chatgpt.com/c/m12-semantic',
    });
    const assistant = dom.window.document.querySelector<HTMLElement>(
      '[data-message-id="m12-semantic"]',
    )!;
    const parsed = parseMessageContentResult(assistant, 'm12-semantic');
    parsed.content.push({
      fallbackText: 'T m alpha to R UA subset Z int',
      kind: 'mathBlock',
      provenance: 'explicit',
      source: '\\mathcal{T}_m^\\alpha \\rightarrow R_{UA} \\subseteq Z_{int}',
      sourceFormat: 'tex',
    });
    const fixtureRequest = request({
      scope: 'single-response',
      messageId: 'assistant-1',
    });
    fixtureRequest.document = {
      ...fixtureRequest.document,
      messages: [{
        ...fixtureRequest.document.messages[1]!,
        content: parsed.content,
      }],
      warnings: parsed.warnings,
    };

    const { documentXml, styles } = await packageParts(
      await renderStructuredDocxBlob(fixtureRequest),
    );
    const textFigureStyle = styles.match(
      /<w:style[^>]+w:styleId="ChatExportTextFigure"[\s\S]*?<\/w:style>/u,
    )?.[0];

    expect(documentXml.match(/<m:oMath>/gu)).toHaveLength(6);
    expect(documentXml.match(/<m:oMathPara>/gu)).toHaveLength(1);
    expect(documentXml).not.toMatch(/<w:t[^>]*>[^<]*τ∈\[0,H\]/u);
    expect(documentXml).toContain('w:pStyle w:val="ChatExportTextFigure"');
    expect(documentXml).toContain('w:pStyle w:val="ChatExportCode"');
    expect(documentXml).toContain('┌──── local overlap');
    expect(documentXml).toContain('│  ● → ■');
    expect(documentXml).toContain('└──── ');
    expect(documentXml).toContain('<m:sSub>');
    expect(textFigureStyle).toContain('Cascadia Mono');
    expect(textFigureStyle).toContain('Noto Sans CJK SC');
    expect(textFigureStyle).toContain('w:color w:val="000000"');
    expect(textFigureStyle).toContain('w:sz w:val="22"');
    expect(textFigureStyle).not.toContain('<w:shd');
  });

  it('renders M13 text-figure labels as anchored Word math without losing the grid', async () => {
    const fixturePath = path.resolve('tests/fixtures/chatgpt/m13-actual-parity-shapes.html');
    const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
      url: 'https://chatgpt.com/c/m13-actual-parity',
    });
    const assistant = dom.window.document.querySelector<HTMLElement>(
      '[data-message-id="m13-actual-parity"]',
    )!;
    const parsed = parseMessageContentResult(assistant, 'm13-actual-parity');
    const fixtureRequest = request({ scope: 'single-response', messageId: 'assistant-1' });
    fixtureRequest.document = {
      ...fixtureRequest.document,
      messages: [{
        ...fixtureRequest.document.messages[1]!,
        content: parsed.content,
      }],
      warnings: parsed.warnings,
    };

    const { documentXml } = await packageParts(
      await renderStructuredDocxBlob(fixtureRequest),
    );

    expect(documentXml.match(/<m:oMath>/gu)).toHaveLength(4);
    expect(documentXml).toContain('蓝色椭圆');
    expect(documentXml).toContain('绿色矩形');
    expect(documentXml).toContain('┌───────────┐');
    expect(documentXml).toContain('control action');
    expect(documentXml).toContain('→ ‖ ');
    expect(documentXml).toContain('T_m^α');
    expect(documentXml).toContain('Z_int');
    expect(documentXml).toContain('R_UA');
    expect(documentXml).toContain('v_u(t)');
  });

  it('renders M14 fragmented live shapes as editable Word math', async () => {
    const fixturePath = path.resolve('tests/fixtures/chatgpt/m14-live-export-shapes.html');
    const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
      url: 'https://chatgpt.com/c/m14-sanitized-shape',
    });
    const assistant = dom.window.document.querySelector<HTMLElement>(
      '[data-message-id="m14-live-export-shapes"]',
    )!;
    const parsed = parseMessageContentResult(assistant, 'm14-live-export-shapes');
    const fixtureRequest = request({ scope: 'single-response', messageId: 'assistant-1' });
    fixtureRequest.document = {
      ...fixtureRequest.document,
      messages: [{
        ...fixtureRequest.document.messages[1]!,
        content: parsed.content,
      }],
      warnings: parsed.warnings,
    };

    const { documentXml } = await packageParts(
      await renderStructuredDocxBlob(fixtureRequest),
    );
    const textFigures = (documentXml.match(/<w:p(?:\s[^>]*)?>[^]*?<\/w:p>/gu) ?? [])
      .filter((paragraph) => paragraph.includes('w:pStyle w:val="ChatExportTextFigure"'))
      .join('');

    expect(documentXml.match(/<m:oMath>/gu)).toHaveLength(8);
    expect(documentXml.match(/<m:oMathPara>/gu)).toHaveLength(1);
    expect(textFigures.match(/<m:oMath>/gu) ?? []).toHaveLength(0);
    expect(documentXml).not.toMatch(/<w:t[^>]*>[^<]*τ∈\[0,H\]/u);
    expect(documentXml).not.toMatch(/<w:t[^>]*>[^<]*τ∈\[0,H\]/u);
    expect(documentXml).not.toContain('x_u(t)=(c_u,s_u,v_u,q_u)');
    expect(documentXml).not.toContain('q=1→q=2→q=3→q=4');
    expect(documentXml).not.toContain('Zint=Tmα∩RUA');
    expect(textFigures).not.toContain('\\mathcal');
    expect(textFigures).toContain('T_m^α');
    expect(textFigures).toContain('Z_int');
    expect(textFigures).toContain('R_UA');
    expect(textFigures).toContain('v_u(t)');
    for (const text of ['local overlap', 'blue ellipse', 'green box', 'control action']) {
      expect(textFigures).toContain(text);
    }
  });

  it('uses renderer-boundary math normalization before writing DOCX text runs', async () => {
    const fixtureRequest = request({ scope: 'single-response', messageId: 'assistant-1' });
    fixtureRequest.document = {
      ...fixtureRequest.document,
      messages: [{
        ...fixtureRequest.document.messages[1]!,
        content: [{
          children: [{ kind: 'text', value: 'Final window \u03c4\u00a0\u2208\u00a0[0,H] remains semantic.' }],
          kind: 'paragraph',
        }],
      }],
      warnings: [],
    };

    const { documentXml } = await packageParts(
      await renderStructuredDocxBlob(fixtureRequest),
    );

    expect(documentXml.match(/<m:oMath>/gu)).toHaveLength(1);
    expect(documentXml).not.toContain('\u03c4\u00a0\u2208\u00a0[0,H]');
  });

  it('returns a render warning for empty preformatted blocks', async () => {
    const fixtureRequest = request({ scope: 'single-response', messageId: 'assistant-1' });
    fixtureRequest.document = {
      ...fixtureRequest.document,
      messages: [{
        ...fixtureRequest.document.messages[1]!,
        content: [{
          kind: 'codeBlock',
          presentation: 'textFigure',
          value: '\n',
        }],
      }],
      warnings: [],
    };

    const result = await renderStructuredDocx(fixtureRequest);

    expect(result.warnings).toContainEqual({
      code: 'unsupported-content',
      message: 'An empty preformatted block was preserved as an empty local export block.',
      provenance: {
        messageId: 'assistant-1',
        nodePath: [0],
        sourceKind: 'codeBlock',
        stage: 'render',
      },
    });
  });

  it('renders the shared synthetic ChatGPT fixture without dropping structural text', async () => {
    const fixturePath = path.resolve(
      'tests/fixtures/reference/synthetic-conversation.html',
    );
    const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
      url: 'https://chatgpt.com/c/synthetic',
    });
    const assistant = dom.window.document.querySelector<HTMLElement>(
      '[data-message-id="fixture-assistant-1"]',
    );
    if (!assistant) throw new Error('Synthetic assistant fixture is missing.');
    const parsed = parseMessageContentResult(assistant, 'fixture-assistant-1');
    const fixtureRequest = request({ scope: 'assistant-only' });
    fixtureRequest.document = {
      ...fixtureRequest.document,
      messages: [{
        ...fixtureRequest.document.messages[1]!,
        content: parsed.content,
      }],
      warnings: parsed.warnings,
    };

    const { documentXml } = await packageParts(
      await renderStructuredDocxBlob(fixtureRequest),
    );

    for (const requiredText of [
      'Reference Export Fixture',
      'An English paragraph',
      'Synthetic content only.',
      'First',
      'Nested',
      'Alpha',
      'function identity',
      'Example Domain',
      'P12:',
    ]) {
      expect(documentXml).toContain(requiredText);
    }
    expect(documentXml).toContain('<w:tbl>');
    expect(documentXml).toContain('<w:numPr>');
    expect(documentXml).toContain('<w:hyperlink');
  });
});
