import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';

import type { ImageResolver } from '../../src/assets/image-resolver';
import { resolveImageAsset } from '../../src/assets/image-resolver';
import type { BlockNode, ChatDocument } from '../../src/document/ast';
import type { ExportRequest } from '../../src/document/export';
import {
  EXPORT_STRING_KEYS,
  getExportStrings,
} from '../../src/localization/strings';
import { parseMessageContentResult } from '../../src/platform/chatgpt/content-parser';
import { renderStructuredDocx } from '../../src/renderers/docx/docx-node-renderer';
import { createMathFallbackSvg } from '../../src/renderers/docx/math-fallback';
import { nodePdfFontEnvironment } from '../../scripts/lib/node-pdf-font-environment';
import { renderStructuredPdf } from '../../src/renderers/pdf/pdf-node-renderer';
import { getUiStrings, UI_STRING_KEYS } from '../../src/ui/i18n';

const fontEnvironment = nodePdfFontEnvironment;

function request(
  language: 'en' | 'zh-CN',
  content: BlockNode[] = [{
    children: [{ kind: 'text', value: 'Localized body' }],
    kind: 'paragraph',
  }],
): ExportRequest {
  const document: ChatDocument = {
    version: 1,
    title: 'Localization Fixture',
    source: {
      platform: 'chatgpt',
      url: 'https://chatgpt.com/c/localization',
      capturedAt: '2026-06-23T06:00:00.000Z',
    },
    exportedAt: '2026-06-23T06:01:00.000Z',
    messages: [{
      content,
      id: 'assistant-localized',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }],
    warnings: [],
  };
  return {
    document,
    selection: { scope: 'full-conversation' },
    options: {
      codeStyle: 'document',
      fileName: 'localization',
      format: 'docx',
      includePrompts: true,
      language,
      paper: 'a4',
      theme: 'light',
    },
  };
}

describe('Chinese and English localization', () => {
  it('keeps UI and export catalogs key-complete in both languages', () => {
    for (const language of ['en', 'zh-CN'] as const) {
      const ui = getUiStrings(language);
      const exported = getExportStrings(language);
      expect(Object.keys(ui).sort()).toEqual(UI_STRING_KEYS);
      expect(Object.keys(exported).sort()).toEqual(EXPORT_STRING_KEYS);
      expect(ui.exportAs(ui.response, 'pdf')).not.toHaveLength(0);
      expect(ui.selectedCount(2)).not.toHaveLength(0);
      expect(exported.imageUnavailable('chart')).not.toHaveLength(0);
      expect(exported.collectionDidNotStabilize(2)).not.toHaveLength(0);
      expect(exported.unsupportedContentWarning('video')).not.toHaveLength(0);
    }
  });

  it('switches UI, warning, error, and popup text to Chinese', () => {
    const ui = getUiStrings('zh-CN');
    const exported = getExportStrings('zh-CN');

    expect(ui.settingsTitle).toBe('导出设置');
    expect(ui.popupDescription).toContain('本地导出');
    expect(exported.imageUnavailable('图表')).toBe('[图片不可用：图表]');
    expect(exported.pdfMathFallbackWarning).toContain('不支持的 PDF 公式');
    expect(exported.collectionDidNotStabilize(2)).toContain('2 次快照');
  });

  it('localizes extracted fallback content and warnings', () => {
    const dom = new JSDOM(
      '<article><p>正文 <img alt="内嵌图" src="data:image/png;base64,AA=="></p>'
      + '<img alt="缺失图"><video>视频</video></article>',
    );
    const article = dom.window.document.querySelector<HTMLElement>('article')!;
    const result = parseMessageContentResult(article, 'message-zh', 'zh-CN');
    const text = JSON.stringify(result.content);

    expect(text).toContain('[行内图片回退：内嵌图]');
    expect(text).toContain('[图片不可用：缺失图]');
    expect(text).toContain('视频');
    expect(result.warnings.map(({ message }) => message)).toEqual(expect.arrayContaining([
      '嵌套的行内图片已保留为可见回退文本。',
      '没有可用来源的图片已保留为可见回退文本。',
      '不支持的 <video> 内容已使用可见回退保留。',
    ]));
  });

  it('localizes image and math degradation messages', async () => {
    const image = await resolveImageAsset({
      alt: '图表',
      kind: 'image',
      source: { kind: 'data-url', value: 'data:image/png;base64,invalid' },
    }, { language: 'zh-CN' }, { environment: undefined });
    const mathSvg = new TextDecoder().decode(createMathFallbackSvg({
      fallbackText: 'x',
      kind: 'mathBlock',
      source: '\\color{red}{x}',
      sourceFormat: 'tex',
    }, 'zh-CN').data);

    expect(image.status).toBe('fallback');
    if (image.status === 'fallback') {
      expect(image.warning.message).toBe('当前环境无法解码图片。');
    }
    expect(mathSvg).toContain('不支持的公式');
    expect(mathSvg).toContain('不支持的公式回退');
  });

  it('localizes DOCX metadata and role headings', async () => {
    const result = await renderStructuredDocx(request('zh-CN'));
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const core = await archive.file('docProps/core.xml')!.async('string');
    const documentXml = await archive.file('word/document.xml')!.async('string');

    expect(core).toContain('由 ChatGPT2Doc 在浏览器中本地导出的 ChatGPT 对话。');
    expect(core).toContain('ChatGPT 对话导出');
    expect(documentXml).toContain('助手');
  });

  it('localizes PDF metadata, role headings, and image fallback text', async () => {
    const imageResolver: ImageResolver = async () => ({
      href: 'https://example.com/chart.png',
      status: 'fallback',
      warning: {
        code: 'image-unavailable',
        message: 'synthetic',
        provenance: { sourceKind: 'image', stage: 'asset' },
      },
    });
    const localizedRequest = request('zh-CN', [{
      alt: '图表',
      fallbackHref: 'https://example.com/chart.png',
      kind: 'image',
      source: { kind: 'url', value: 'https://example.com/chart.png' },
    }]);
    localizedRequest.options.format = 'pdf';
    const result = await renderStructuredPdf(localizedRequest, {
      fontEnvironment,
      imageResolver,
    });
    const pdf = await getDocument({
      data: new Uint8Array(await result.blob.arrayBuffer()),
      isEvalSupported: false,
      useWorkerFetch: false,
    }).promise;
    const metadata = await pdf.getMetadata();
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item): item is typeof item & { str: string } => 'str' in item)
      .map(({ str }) => str)
      .join('');

    expect((metadata.info as { Subject?: string }).Subject).toContain('ChatGPT 对话导出');
    expect((metadata.info as { Subject?: string }).Subject).toContain('renderer:m16.1-chat12-14-tex-delimiters');
    expect(text).toContain('由 ChatGPT2Doc 在浏览器中本地导出的 ChatGPT 对话。');
    expect(text).toContain('助手');
    expect(text).toContain('图片不可用：图表');
  });
});
