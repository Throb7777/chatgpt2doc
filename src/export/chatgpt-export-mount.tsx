import { render } from 'preact';

import type { SettingsStorage } from '../settings/settings';
import {
  EXPORT_REQUEST_EVENT,
  type ExportIntent,
} from '../ui/actions/ActionGroup';
import {
  ExportProgressPanel,
  type ExportPanelStatus,
} from '../ui/export/ExportProgressPanel';
import { getUiStrings } from '../ui/i18n';
import { aggregateWarnings } from '../warnings/warning-report';
import { executeChatGptExport } from './chatgpt-export';
import { LocalExportJobController } from './export-job';

export function mountChatGptExport(
  document: Document,
  settingsStorage: SettingsStorage,
): () => void {
  const controller = new LocalExportJobController();
  let mount: HTMLElement | null = null;
  let status: ExportPanelStatus | null = null;
  let language: 'en' | 'zh-CN' = 'en';
  let dismissTimer = 0;
  const clearDismissTimer = () => {
    if (!dismissTimer) return;
    document.defaultView?.clearTimeout(dismissTimer);
    dismissTimer = 0;
  };
  const dismiss = () => {
    clearDismissTimer();
    status = null;
    if (mount) {
      render(null, mount);
      mount.remove();
      mount = null;
    }
  };
  const sync = () => {
    if (!status) {
      dismiss();
      return;
    }
    if (!mount) {
      mount = document.createElement('div');
      mount.dataset.chatExportProgressMount = 'true';
      document.body.append(mount);
    }
    render(
      <ExportProgressPanel
        onCancel={() => controller.cancel()}
        onDismiss={dismiss}
        status={status}
        strings={getUiStrings(language)}
      />,
      mount,
    );
    clearDismissTimer();
    if (
      status.kind === 'cancelled'
      || status.kind === 'completed' && status.warnings.length === 0
    ) {
      dismissTimer = document.defaultView?.setTimeout(dismiss, 2400) ?? 0;
    }
  };
  const onRequest = (event: Event) => {
    const intent = (event as CustomEvent<ExportIntent>).detail;
    if (!intent || controller.busy) return;
    void settingsStorage.load().then(async (settings) => {
      if (controller.busy) return;
      language = settings.language;
      const result = await controller.run(
        (context) => executeChatGptExport(document, intent, settings, context),
        (progress) => {
          clearDismissTimer();
          status = { kind: 'active', progress };
          sync();
        },
      );
      status = result.status === 'completed'
        ? {
            kind: 'completed',
            warnings: settings.showExportDiagnostics
              ? aggregateWarnings(result.value.warnings)
              : [],
          }
        : result.status === 'cancelled'
          ? { kind: 'cancelled' }
          : status;
      sync();
    }).catch((error: unknown) => {
      status = {
        kind: 'failed',
        message: error instanceof Error ? error.message : String(error),
      };
      sync();
    });
  };
  document.addEventListener(EXPORT_REQUEST_EVENT, onRequest);
  return () => {
    controller.cancel();
    document.removeEventListener(EXPORT_REQUEST_EVENT, onRequest);
    dismiss();
  };
}
