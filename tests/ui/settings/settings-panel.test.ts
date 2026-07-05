import { h, render } from 'preact';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_UI_SETTINGS } from '../../../src/settings/settings';
import { SettingsPanel } from '../../../src/ui/settings/SettingsPanel';

afterEach(() => vi.unstubAllGlobals());

function installDom() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://chatgpt.com/c/settings' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('SVGElement', dom.window.SVGElement);
  return dom;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('WPS settings integration', () => {
  it('enables only after permission and helper capability succeed', async () => {
    const dom = installDom();
    vi.stubGlobal('browser', {
      runtime: {
        id: 'abcdefghijklmnopabcdefghijklmnop',
        sendMessage: vi.fn(async (message: { type?: string }) =>
          message.type?.includes('permission')
            ? { ok: true, granted: true, removed: true }
            : {
                ok: true,
                helperVersion: '0.1.0',
                protocolVersion: 1,
                wpsInstalled: true,
              }),
      },
    });
    const onSave = vi.fn();
    render(h(SettingsPanel, {
      onClose: () => undefined,
      onSave,
      settings: DEFAULT_UI_SETTINGS,
    }), dom.window.document.querySelector('#root')!);

    const wpsTarget = [...dom.window.document.querySelectorAll('label')]
      .find(({ textContent }) => textContent?.includes('WPS Office'))!
      .querySelector('input')!;
    wpsTarget.click();
    await flush();

    expect(dom.window.document.querySelector('.chat-export-settings-integration-status')
      ?.textContent).toBe('Ready');
    expect(dom.window.document.body.textContent).toContain('abcdefghijklmnopabcdefghijklmnop');
    [...dom.window.document.querySelectorAll('button')]
      .find(({ textContent }) => textContent === 'Save')!.click();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      copyTarget: 'wps',
      wpsEditableCopy: true,
    }));
  });

  it('keeps the setting off when the helper is unavailable', async () => {
    const dom = installDom();
    vi.stubGlobal('browser', {
      runtime: {
        id: 'abcdefghijklmnopabcdefghijklmnop',
        sendMessage: vi.fn(async (message: { type?: string }) =>
          message.type?.includes('permission')
            ? { ok: true, granted: true, removed: true }
            : undefined),
      },
    });
    render(h(SettingsPanel, {
      onClose: () => undefined,
      onSave: () => undefined,
      settings: DEFAULT_UI_SETTINGS,
    }), dom.window.document.querySelector('#root')!);

    [...dom.window.document.querySelectorAll('label')]
      .find(({ textContent }) => textContent?.includes('WPS Office'))!
      .querySelector('input')!
      .click();
    await flush();

    expect(dom.window.document.querySelector('.chat-export-settings-integration-status')
      ?.textContent).toBe('Helper failed');
    expect(dom.window.document.body.textContent).toContain(
      'Microsoft Word copy remains unchanged.',
    );
  });
});
