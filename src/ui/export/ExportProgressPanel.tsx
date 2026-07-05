import type { ExportProgress } from '../../export/export-job';
import type { WarningSummary } from '../../warnings/warning-report';
import type { UiStrings } from '../i18n';

export type ExportPanelStatus =
  | { kind: 'active'; progress: ExportProgress }
  | { kind: 'cancelled' }
  | { kind: 'completed'; warnings: WarningSummary[] }
  | { kind: 'failed'; message: string };

interface ExportProgressPanelProps {
  onCancel: () => void;
  onDismiss: () => void;
  status: ExportPanelStatus;
  strings: UiStrings;
}

export function ExportProgressPanel({
  onCancel,
  onDismiss,
  status,
  strings,
}: ExportProgressPanelProps) {
  const message = (() => {
    switch (status.kind) {
      case 'active':
        return strings.exportProgress[status.progress.stage];
      case 'completed':
        return strings.exportComplete;
      case 'cancelled':
        return strings.exportCancelled;
      case 'failed':
        return strings.exportFailed(status.message);
      default:
        return status satisfies never;
    }
  })();
  return (
    <section
      aria-label={strings.exportProgressTitle}
      class="chat-export-progress"
      data-chat-export-progress={status.kind}
      role="status"
    >
      {status.kind === 'active' ? (
        <span aria-hidden="true" class="chat-export-progress-spinner" />
      ) : null}
      <p aria-live="polite">{message}</p>
      {status.kind === 'completed' && status.warnings.length > 0 ? (
        <div class="chat-export-warning-report">
          <p>{strings.warningsSummary(
            status.warnings.reduce((total, warning) => total + warning.count, 0),
          )}</p>
          <ul>
            {status.warnings.map((warning) => (
              <li key={`${warning.code}:${warning.message}`}>
                <strong>{warning.message}</strong>
                {' '}
                <span>({strings.warningCount(warning.count)})</span>
                <div>{strings.warningAction[warning.code]}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {status.kind === 'active' ? (
        <button class="chat-export-action-button" onClick={onCancel} type="button">
          {strings.cancelExport}
        </button>
      ) : status.kind === 'failed' || status.kind === 'completed' && status.warnings.length > 0 ? (
        <button class="chat-export-action-button" onClick={onDismiss} type="button">
          {strings.close}
        </button>
      ) : null}
    </section>
  );
}
