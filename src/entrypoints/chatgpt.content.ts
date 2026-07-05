import '../ui/actions/actions.css';
import { mountWordClipboardIntegration } from '../clipboard/word-clipboard';
import { mountChatGptExport } from '../export/chatgpt-export-mount';
import { createWpsCopyCoordinator } from '../integrations/wps/wps-copy-coordinator';
import { createDefaultSettingsStorage } from '../settings/settings';
import { mountChatExportActions } from '../ui/actions/action-mounts';

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    const settingsStorage = createDefaultSettingsStorage();
    const wpsCopy = createWpsCopyCoordinator(document, settingsStorage);
    const cleanupActions = mountChatExportActions(document, { settingsStorage });
    const cleanupExport = mountChatGptExport(document, settingsStorage);
    const cleanupClipboard = mountWordClipboardIntegration(document, {
      onCopied: wpsCopy.onCopied,
    });
    ctx.onInvalidated(() => {
      cleanupClipboard();
      wpsCopy.cleanup();
      cleanupExport();
      cleanupActions();
    });
  },
});
