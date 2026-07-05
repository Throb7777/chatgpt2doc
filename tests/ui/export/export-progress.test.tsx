import { render } from 'preact';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExportProgressPanel } from '../../../src/ui/export/ExportProgressPanel';
import { getUiStrings } from '../../../src/ui/i18n';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('export progress panel', () => {
  it('shows localized progress and invokes cancellation', () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('SVGElement', dom.window.SVGElement);
    const cancel = vi.fn();
    const root = dom.window.document.querySelector<HTMLElement>('#root')!;

    render(
      <ExportProgressPanel
        onCancel={cancel}
        onDismiss={() => undefined}
        status={{
          kind: 'active',
          progress: { completed: 1, stage: 'rendering', total: 2 },
        }}
        strings={getUiStrings('zh-CN')}
      />,
      root,
    );
    expect(root.textContent).toContain('正在生成文档');
    root.querySelector<HTMLButtonElement>('button')!.click();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('shows grouped actionable warnings after a degraded export', () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('SVGElement', dom.window.SVGElement);
    const root = dom.window.document.querySelector<HTMLElement>('#root')!;

    render(
      <ExportProgressPanel
        onCancel={() => undefined}
        onDismiss={() => undefined}
        status={{
          kind: 'completed',
          warnings: [{
            code: 'image-unavailable',
            count: 2,
            message: '无法嵌入图片。',
            provenance: [
              { messageId: 'one', sourceKind: 'image', stage: 'asset' },
              { messageId: 'two', sourceKind: 'image', stage: 'asset' },
            ],
          }],
        }}
        strings={getUiStrings('zh-CN')}
      />,
      root,
    );

    expect(root.textContent).toContain('共有 2 条警告');
    expect(root.textContent).toContain('无法嵌入图片');
    expect(root.textContent).toContain('2 处');
    expect(root.textContent).toContain('打开链接并手动核对图片');
  });
});
