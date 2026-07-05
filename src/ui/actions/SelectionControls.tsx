import type { ExportFormat } from '../../document/export';
import type { UiStrings } from '../i18n';

interface MessageSelectionToggleProps {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle: (checked: boolean) => void;
}

export function MessageSelectionToggle({
  checked,
  disabled,
  label,
  onToggle,
}: MessageSelectionToggleProps) {
  return (
    <label class="chat-export-selection-toggle">
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onToggle(event.currentTarget.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

interface SelectionActionBarProps {
  onCancel: () => void;
  onExport: (format: ExportFormat) => void;
  selectedCount: number;
  strings: UiStrings;
}

export function SelectionActionBar({
  onCancel,
  onExport,
  selectedCount,
  strings,
}: SelectionActionBarProps) {
  const empty = selectedCount === 0;
  return (
    <div aria-label="Selected message export" class="chat-export-selection-bar" role="region">
      <p aria-live="polite" class="chat-export-selection-status">
        {empty
          ? strings.selectAtLeastOne
          : strings.selectedCount(selectedCount)}
      </p>
      <div class="chat-export-selection-actions">
        <button class="chat-export-action-button" onClick={onCancel} type="button">
          {strings.cancel}
        </button>
        {(['docx', 'pdf'] as const).map((format) => (
          <button
            aria-label={strings.exportAs(strings.selectMessages, format)}
            class="chat-export-action-button"
            data-chat-export-selection-format={format}
            disabled={empty}
            key={format}
            onClick={() => onExport(format)}
            type="button"
          >
            {format.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
