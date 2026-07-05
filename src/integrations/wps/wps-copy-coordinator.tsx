import { render } from 'preact';

import type { WordClipboardPayload } from '../../clipboard/word-clipboard';
import type { SettingsStorage } from '../../settings/settings';
import { getUiStrings } from '../../ui/i18n';
import { WpsCopyToast, type WpsCopyToastStatus } from './WpsCopyToast';
import { pingWpsHelper, prepareWpsClipboard } from './wps-client';
import { createWpsClipboardDocument } from './wps-document';

export interface WpsCopyCoordinator {
  cleanup: () => void;
  onCopied: (payload: WordClipboardPayload) => Promise<void>;
}

export function createWpsCopyCoordinator(
  document: Document,
  settingsStorage: SettingsStorage,
): WpsCopyCoordinator {
  let sequence = 0;
  let mount: HTMLElement | null = null;
  let dismissTimer = 0;

  const clearTimer = () => {
    if (!dismissTimer) return;
    document.defaultView?.clearTimeout(dismissTimer);
    dismissTimer = 0;
  };
  const dismiss = () => {
    clearTimer();
    if (!mount) return;
    render(null, mount);
    mount.remove();
    mount = null;
  };
  const show = (status: WpsCopyToastStatus, language: 'en' | 'zh-CN') => {
    clearTimer();
    if (!mount) {
      mount = document.createElement('div');
      mount.dataset.chatExportWpsCopyMount = 'true';
      document.body.append(mount);
    }
    render(<WpsCopyToast status={status} strings={getUiStrings(language)} />, mount);
    if (status !== 'preparing') {
      dismissTimer = document.defaultView?.setTimeout(dismiss, 2600) ?? 0;
    }
  };

  return {
    cleanup: () => {
      sequence += 1;
      dismiss();
    },
    onCopied: async (payload) => {
      const settings = await settingsStorage.load();
      if (settings.copyTarget !== 'wps' && !settings.wpsEditableCopy) return;
      const current = ++sequence;
      show('preparing', settings.language);
      if (await pingWpsHelper() !== 'ready') {
        if (sequence === current) show('fallback', settings.language);
        return;
      }
      try {
        const docxBase64 = await createWpsClipboardDocument(document, payload, settings);
        if (sequence !== current) return;
        const response = await prepareWpsClipboard({
          docxBase64,
          html: payload.html,
          text: payload.text,
        });
        if (sequence !== current) return;
        show(response.ok ? 'ready' : 'fallback', settings.language);
      } catch {
        if (sequence === current) show('fallback', settings.language);
      }
    },
  };
}
