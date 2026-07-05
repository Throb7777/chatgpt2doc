import type { ExportFormat, ExportScope } from '../../document/export';
import type { UiStrings } from '../i18n';

export const EXPORT_REQUEST_EVENT = 'chat-export:request';

export type ExportCollectionMode = 'recent' | 'scan-complete' | 'visible-only';

export type ExportIntent =
  | {
    collectionMode?: Extract<ExportCollectionMode, 'visible-only'>;
    format: ExportFormat;
    messageId: string;
    scope: Extract<ExportScope, 'single-response'>;
  }
  | {
    collectionMode?: Extract<ExportCollectionMode, 'visible-only'>;
    format: ExportFormat;
    messageIds: string[];
    scope: Extract<ExportScope, 'selected-messages'>;
  }
  | {
    collectionMode?: ExportCollectionMode;
    format: ExportFormat;
    recentCount?: number;
    scope: Extract<ExportScope, 'full-conversation'>;
  };

interface ActionGroupProps {
  disabled: boolean;
  kind: 'conversation' | 'response';
  onRequest: (format: ExportFormat) => void;
  onOpenSettings?: () => void;
  onSelectMessages?: () => void;
  selectionActive?: boolean;
  selectionDisabled?: boolean;
  strings: UiStrings;
}

interface FormatButtonProps {
  disabled: boolean;
  format: ExportFormat;
  onRequest: (format: ExportFormat) => void;
  target: string;
  strings: UiStrings;
}

function FormatIcon({ format }: { format: ExportFormat }) {
  return (
    <svg
      aria-hidden="true"
      class="chat-export-format-icon"
      data-chat-export-icon={format}
      focusable="false"
      viewBox="0 0 24 24"
    >
      {format === 'docx' ? (
        <>
          <path
            class="chat-export-format-icon-page chat-export-format-icon-page--outline"
            d="M6.7 2.7h7.1l4.4 4.4v14.2H5.8V3.6c0-.5.4-.9.9-.9z"
          />
          <path
            class="chat-export-format-icon-fold"
            d="M13.8 2.9v4.3h4.3"
          />
          <text
            class="chat-export-format-icon-mark chat-export-format-icon-mark--docx"
            x="12"
            y="15.9"
          >
            W
          </text>
        </>
      ) : (
        <>
          <path
            class="chat-export-format-icon-page chat-export-format-icon-page--filled"
            d="M6.7 2.7h7.1l4.4 4.4v14.2H5.8V3.6c0-.5.4-.9.9-.9z"
          />
          <path
            class="chat-export-format-icon-fold chat-export-format-icon-fold--pdf"
            d="M13.8 2.9v4.3h4.3"
          />
          <text
            class="chat-export-format-icon-mark chat-export-format-icon-mark--pdf"
            x="12"
            y="16.4"
          >
            PDF
          </text>
        </>
      )}
    </svg>
  );
}

export function FormatButton({
  disabled,
  format,
  onRequest,
  strings,
  target,
}: FormatButtonProps) {
  return (
    <button
      aria-label={strings.exportAs(target, format)}
      class={`chat-export-action-button chat-export-format-button chat-export-format-button--${format}`}
      data-chat-export-format={format}
      disabled={disabled}
      onClick={() => onRequest(format)}
      type="button"
    >
      <FormatIcon format={format} />
    </button>
  );
}

export function ActionGroup({
  disabled,
  kind,
  onOpenSettings,
  onRequest,
  onSelectMessages,
  selectionActive = false,
  selectionDisabled = false,
  strings,
}: ActionGroupProps) {
  const target = kind === 'conversation' ? strings.conversation : strings.response;

  return (
    <div
      aria-label={`${strings.export} ${target}`}
      class={`chat-export-action-group chat-export-action-group--${kind}`}
      role="group"
    >
      <span class="chat-export-action-label">{strings.export} {target}</span>
      {kind === 'conversation' && onSelectMessages ? (
        <button
          class="chat-export-action-button"
          disabled={selectionDisabled || selectionActive}
          onClick={onSelectMessages}
          type="button"
        >
          {selectionActive ? strings.selecting : strings.selectMessages}
        </button>
      ) : null}
      {kind === 'conversation' && onOpenSettings ? (
        <button
          class="chat-export-action-button"
          data-chat-export-settings-button="true"
          onClick={onOpenSettings}
          type="button"
        >
          {strings.settings}
        </button>
      ) : null}
      {(['docx', 'pdf'] as const).map((format) => (
        <FormatButton
          disabled={disabled}
          format={format}
          key={format}
          onRequest={onRequest}
          strings={strings}
          target={target}
        />
      ))}
    </div>
  );
}
