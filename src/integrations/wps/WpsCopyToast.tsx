import type { UiStrings } from '../../ui/i18n';

export type WpsCopyToastStatus = 'fallback' | 'preparing' | 'ready';

interface WpsCopyToastProps {
  status: WpsCopyToastStatus;
  strings: UiStrings;
}

export function WpsCopyToast({ status, strings }: WpsCopyToastProps) {
  const message = status === 'preparing'
    ? strings.wpsCopyPreparing
    : status === 'ready'
      ? strings.wpsCopyReady
      : strings.wpsCopyFallback;
  return (
    <aside
      aria-live="polite"
      class="chat-export-progress chat-export-wps-copy-toast"
      data-chat-export-wps-copy={status}
      role="status"
    >
      {status === 'preparing' ? <span class="chat-export-progress-spinner" /> : null}
      <p>{message}</p>
    </aside>
  );
}
