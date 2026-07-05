import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import type { ImageResolver } from '../../../src/assets/image-resolver';
import type { ChatDocument, DocumentWarning } from '../../../src/document/ast';
import type { ExportRequest } from '../../../src/document/export';
import { parseMessageContentResult } from '../../../src/platform/chatgpt/content-parser';
import {
  createMathFallbackSvg,
  type MathFallbackResolver,
} from '../../../src/renderers/docx/math-fallback';
import { renderStructuredDocx } from '../../../src/renderers/docx/docx-node-renderer';

const redPixelPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
));

describe('DOCX combined regression fixture', () => {
  it('packages rich content, editable math, images, and warned SVG fallback together', async () => {
    const fixturePath = path.resolve(
      'tests/fixtures/reference/synthetic-conversation.html',
    );
    const dom = new JSDOM(await readFile(fixturePath, 'utf8'), {
      url: 'https://chatgpt.com/c/synthetic',
    });
    const articles = Array.from(
      dom.window.document.querySelectorAll<HTMLElement>('[data-message-id]'),
    );
    const parserWarnings: DocumentWarning[] = [];
    const messages = articles.map((element, order) => {
      const id = element.dataset.messageId ?? `message-${order}`;
      const parsed = parseMessageContentResult(element, id);
      parserWarnings.push(...parsed.warnings);
      return {
        content: parsed.content,
        id,
        order,
        role: element.dataset.messageAuthorRole === 'assistant'
          ? 'assistant' as const
          : 'user' as const,
        selected: true,
        status: 'complete' as const,
      };
    });
    const assistant = messages.find(({ role }) => role === 'assistant');
    if (!assistant) throw new Error('Synthetic assistant message is missing.');
    assistant.content.push({
      fallbackText: 'Unsupported color expression: x',
      kind: 'mathBlock',
      source: '\\color{red}{x}',
      sourceFormat: 'tex',
    });
    const document: ChatDocument = {
      version: 1,
      title: 'Combined DOCX Regression',
      source: {
        platform: 'chatgpt',
        url: 'https://chatgpt.com/c/synthetic',
        capturedAt: '2026-06-22T12:00:00.000Z',
      },
      exportedAt: '2026-06-22T12:01:00.000Z',
      messages,
      warnings: parserWarnings,
    };
    const request: ExportRequest = {
      document,
      selection: { scope: 'full-conversation' },
      options: {
        codeStyle: 'document',
        fileName: 'combined-docx-regression',
        format: 'docx',
        includePrompts: true,
        language: 'en',
        paper: 'a4',
        theme: 'light',
      },
    };
    const imageResolver: ImageResolver = async () => ({
      data: redPixelPng,
      height: 180,
      status: 'embedded',
      width: 320,
    });
    const mathFallbackResolver: MathFallbackResolver = async (node, context) => {
      const svg = createMathFallbackSvg(node);
      return {
        height: svg.height,
        pngData: redPixelPng,
        status: 'embedded',
        svgData: svg.data,
        warning: {
          code: 'math-fallback',
          message: 'Synthetic combined regression fallback.',
          provenance: {
            messageId: context?.messageId,
            nodePath: context?.nodePath,
            sourceKind: node.kind,
            stage: 'render',
          },
        },
        width: svg.width,
      };
    };
    const result = await renderStructuredDocx(request, {
      imageResolver,
      mathFallbackResolver,
    });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const documentXml = await archive.file('word/document.xml')!.async('string');
    const contentTypes = await archive.file('[Content_Types].xml')!.async('string');
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );

    for (const text of [
      'Reference Export Fixture',
      'An English paragraph',
      'Synthetic content only.',
      'Nested',
      'Alpha',
      'function identity',
      'Example Domain',
      'P12:',
    ]) {
      expect(documentXml).toContain(text);
    }
    expect(documentXml).toContain('<w:tbl>');
    expect(documentXml).toContain('<w:numPr>');
    expect(documentXml).toContain('<m:oMath>');
    expect(documentXml).toContain('name="Unsupported equation fallback"');
    expect(media.some((name) => name.endsWith('.svg'))).toBe(true);
    expect(media.some((name) => name.endsWith('.png'))).toBe(true);
    expect(media.length).toBeGreaterThanOrEqual(2);
    expect(contentTypes).toContain('image/svg+xml');
    expect(contentTypes).toContain('image/png');
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'math-fallback',
        provenance: expect.objectContaining({
          messageId: 'fixture-assistant-1',
          sourceKind: 'mathBlock',
          stage: 'render',
        }),
      }),
    ]));
  });
});
