import { render } from 'preact';

import type { ExportFormat } from '../../document/export';
import {
  createDefaultSettingsStorage,
  DEFAULT_UI_SETTINGS,
  normalizeUiSettings,
  type SettingsStorage,
  type UiSettings,
} from '../../settings/settings';
import {
  observeChatGptPage,
  type ChatGptPageSnapshot,
  type DiscoveredChatMessage,
} from '../../platform/chatgpt/message-discovery';
import { ActionGroup, EXPORT_REQUEST_EVENT, type ExportIntent } from './ActionGroup';
import { FloatingExportPanel } from './FloatingExportPanel';
import { MessageSelectionToggle, SelectionActionBar } from './SelectionControls';
import { MessageSelectionState } from './selection-state';
import { getUiStrings, type UiStrings } from '../i18n';
import { SettingsPanel } from '../settings/SettingsPanel';

const ACTION_MOUNT_SELECTOR = '[data-chat-export-actions]';
const FLOATING_PANEL_SELECTOR = '[data-chat-export-floating-panel]';
const SELECTION_MOUNT_SELECTOR = '[data-chat-export-selection]';
const SELECTION_BAR_SELECTOR = '[data-chat-export-selection-bar]';
const SETTINGS_MOUNT_SELECTOR = '[data-chat-export-settings]';

interface SelectionBindings {
  onCancel: () => void;
  onExport: (format: ExportFormat) => void;
  onStart: () => void;
  onToggle: (messageId: string, checked: boolean) => void;
  state: MessageSelectionState;
}

interface SettingsBindings {
  current: UiSettings;
  onClose: () => void;
  onOpen: () => void;
  onSave: (settings: UiSettings) => void;
  onUpdate: (settings: UiSettings) => void;
  open: boolean;
}

export interface ActionMountOptions {
  settingsStorage?: SettingsStorage;
}

function dispatchExportIntent(doc: Document, intent: ExportIntent): void {
  const view = doc.defaultView;
  if (!view) return;
  doc.dispatchEvent(new view.CustomEvent<ExportIntent>(EXPORT_REQUEST_EVENT, {
    detail: intent,
  }));
}

function conversationExportIntent(format: ExportFormat, settings: UiSettings): ExportIntent {
  if (settings.defaultScope === 'recent-messages') {
    return {
      collectionMode: 'recent',
      format,
      recentCount: settings.recentCount,
      scope: 'full-conversation',
    };
  }
  return {
    collectionMode: settings.collectionMode,
    format,
    scope: 'full-conversation',
  };
}

function removeMount(mount: HTMLElement): void {
  render(null, mount);
  mount.remove();
}

function ensureMount(
  doc: Document,
  parent: HTMLElement,
  kind: 'conversation' | 'response',
  messageId?: string,
): HTMLElement {
  const existing = [...parent.children].find((child) =>
    child instanceof doc.defaultView!.HTMLElement
    && child.dataset.chatExportActions === kind
    && child.getAttribute('data-chat-export-message-id') === (messageId ?? null));
  if (existing instanceof doc.defaultView!.HTMLElement) return existing;

  const mount = doc.createElement('div');
  mount.dataset.chatExportActions = kind;
  if (messageId) mount.dataset.chatExportMessageId = messageId;
  if (kind === 'conversation') parent.prepend(mount);
  else parent.append(mount);
  return mount;
}

function ensureFloatingPanelMount(doc: Document): HTMLElement {
  let mount = doc.querySelector<HTMLElement>(FLOATING_PANEL_SELECTOR);
  if (mount) return mount;

  mount = doc.createElement('div');
  mount.dataset.chatExportActions = 'conversation';
  mount.dataset.chatExportFloatingPanel = 'true';
  doc.body.append(mount);
  return mount;
}

function renderActions(
  doc: Document,
  mount: HTMLElement,
  kind: 'conversation' | 'response',
  disabled: boolean,
  message?: DiscoveredChatMessage,
  selection?: SelectionBindings,
  messages: DiscoveredChatMessage[] = [],
  settings?: SettingsBindings,
): void {
  const strings = getUiStrings(settings?.current.language ?? DEFAULT_UI_SETTINGS.language);
  const onRequest = (format: ExportFormat) => {
    dispatchExportIntent(doc, message
      ? { format, scope: 'single-response', messageId: message.id }
      : conversationExportIntent(format, settings?.current ?? DEFAULT_UI_SETTINGS));
  };
  render(
    <ActionGroup
      disabled={disabled}
      kind={kind}
      onOpenSettings={kind === 'conversation' ? settings?.onOpen : undefined}
      onRequest={onRequest}
      onSelectMessages={kind === 'conversation' ? selection?.onStart : undefined}
      selectionActive={selection?.state.active}
      selectionDisabled={!messages.some(({ status }) => status === 'complete')}
      strings={strings}
    />,
    mount,
  );
}

function renderFloatingPanel(
  doc: Document,
  mount: HTMLElement,
  disabled: boolean,
  selection: SelectionBindings,
  messages: DiscoveredChatMessage[],
  settings: SettingsBindings,
): void {
  const strings = getUiStrings(settings.current.language);
  const onRequest = (format: ExportFormat) => {
    dispatchExportIntent(doc, conversationExportIntent(format, settings.current));
  };
  render(
    <FloatingExportPanel
      collapsed={settings.current.panelCollapsed}
      disabled={disabled}
      onPanelPositionChange={(panelPosition) => {
        settings.onUpdate({ ...settings.current, panelPosition });
      }}
      onPanelPositionReset={() => {
        settings.onUpdate({ ...settings.current, panelPosition: null });
      }}
      onOpenSettings={settings.onOpen}
      onRequest={onRequest}
      onSelectMessages={selection.onStart}
      panelPosition={settings.current.panelPosition}
      selectionActive={selection.state.active}
      selectionDisabled={!messages.some(({ status }) => status === 'complete')}
      strings={strings}
    />,
    mount,
  );
}

function ensureSelectionMount(
  doc: Document,
  message: DiscoveredChatMessage,
): HTMLElement {
  const existing = [...message.element.children].find((child) =>
    child instanceof doc.defaultView!.HTMLElement
    && child.dataset.chatExportSelection === message.id);
  if (existing instanceof doc.defaultView!.HTMLElement) return existing;
  const mount = doc.createElement('div');
  mount.dataset.chatExportSelection = message.id;
  message.element.prepend(mount);
  return mount;
}

function syncSelectionControls(
  doc: Document,
  snapshot: ChatGptPageSnapshot,
  selection?: SelectionBindings,
  strings: UiStrings = getUiStrings(DEFAULT_UI_SETTINGS.language),
): void {
  const active = selection?.state.active === true;
  const currentTargets = new Map(
    snapshot.messages.map((message) => [message.id, message.element]),
  );

  for (const mount of doc.querySelectorAll<HTMLElement>(SELECTION_MOUNT_SELECTOR)) {
    const id = mount.dataset.chatExportSelection;
    if (!active || !id || mount.parentElement !== currentTargets.get(id)) removeMount(mount);
  }
  for (const bar of doc.querySelectorAll<HTMLElement>(SELECTION_BAR_SELECTOR)) {
    if (!active) removeMount(bar);
  }
  if (!active || !selection) return;

  for (const message of snapshot.messages) {
    const mount = ensureSelectionMount(doc, message);
    render(
      <MessageSelectionToggle
        checked={selection.state.isSelected(message.id)}
        disabled={message.status === 'streaming'}
        label={strings.selectMessage(message.order + 1)}
        onToggle={(checked) => selection.onToggle(message.id, checked)}
      />,
      mount,
    );
  }

  let bar = doc.querySelector<HTMLElement>(SELECTION_BAR_SELECTOR);
  if (!bar) {
    bar = doc.createElement('div');
    bar.dataset.chatExportSelectionBar = 'true';
    doc.body.append(bar);
  }
  render(
    <SelectionActionBar
      onCancel={selection.onCancel}
      onExport={selection.onExport}
      selectedCount={selection.state.selectedInSourceOrder().length}
      strings={strings}
    />,
    bar,
  );
}

export function syncChatExportActions(
  doc: Document,
  snapshot: ChatGptPageSnapshot,
  selection?: SelectionBindings,
  settings?: SettingsBindings,
): void {
  const view = doc.defaultView;
  if (!view) return;
  const assistantMessages = snapshot.messages.filter(({ role }) => role === 'assistant');
  const showPerMessageActions = settings?.current.showPerMessageActions ?? true;
  const activeTargets = new Map(showPerMessageActions
    ? assistantMessages.map((message) => [message.id, message.element])
    : []);

  for (const mount of doc.querySelectorAll<HTMLElement>(ACTION_MOUNT_SELECTOR)) {
    const kind = mount.dataset.chatExportActions;
    const messageId = mount.dataset.chatExportMessageId;
    const valid = kind === 'conversation'
      ? mount.dataset.chatExportFloatingPanel === 'true' && mount.parentElement === doc.body
      : kind === 'response'
        && Boolean(messageId)
        && mount.parentElement === activeTargets.get(messageId!);
    if (!valid) removeMount(mount);
  }

  if (selection && settings) {
    renderFloatingPanel(
      doc,
      ensureFloatingPanelMount(doc),
      snapshot.messages.length === 0
        || snapshot.messages.some(({ status }) => status === 'streaming'),
      selection,
      snapshot.messages,
      settings,
    );
  }

  if (showPerMessageActions) {
    for (const message of assistantMessages) {
      const mount = ensureMount(doc, message.element, 'response', message.id);
      renderActions(
        doc,
        mount,
        'response',
        message.status === 'streaming',
        message,
        selection,
        snapshot.messages,
        settings,
      );
    }
  }
  const strings = getUiStrings(settings?.current.language ?? DEFAULT_UI_SETTINGS.language);
  syncSelectionControls(doc, snapshot, selection, strings);
  syncSettingsPanel(doc, settings);
}

function syncSettingsPanel(doc: Document, settings?: SettingsBindings): void {
  for (const mount of doc.querySelectorAll<HTMLElement>(SETTINGS_MOUNT_SELECTOR)) {
    if (!settings?.open) removeMount(mount);
  }
  if (!settings?.open) return;

  let mount = doc.querySelector<HTMLElement>(SETTINGS_MOUNT_SELECTOR);
  if (!mount) {
    mount = doc.createElement('div');
    mount.dataset.chatExportSettings = 'true';
    doc.body.append(mount);
  }
  render(
    <SettingsPanel
      onClose={settings.onClose}
      onSave={settings.onSave}
      settings={settings.current}
    />,
    mount,
  );
}

export function mountChatExportActions(
  doc: Document,
  options: ActionMountOptions = {},
): () => void {
  const state = new MessageSelectionState();
  const storage = options.settingsStorage ?? createDefaultSettingsStorage();
  let latestSnapshot: ChatGptPageSnapshot | null = null;
  let disposed = false;
  const rerender = () => {
    if (latestSnapshot) {
      syncChatExportActions(doc, latestSnapshot, selection, settings);
    }
  };
  const restoreSettingsFocus = () => {
    doc.defaultView?.queueMicrotask(() => {
      doc.querySelector<HTMLElement>('[data-chat-export-settings-button]')?.focus();
    });
  };
  const selection: SelectionBindings = {
    state,
    onStart: () => {
      if (!latestSnapshot) return;
      state.start(latestSnapshot.url, latestSnapshot.messages);
      rerender();
    },
    onToggle: (messageId, checked) => {
      state.toggle(messageId, checked);
      rerender();
    },
    onCancel: () => {
      state.cancel();
      rerender();
    },
    onExport: (format) => {
      const messageIds = state.selectedInSourceOrder();
      if (messageIds.length === 0) return;
      dispatchExportIntent(doc, { format, scope: 'selected-messages', messageIds });
    },
  };
  const settings: SettingsBindings = {
    current: { ...DEFAULT_UI_SETTINGS },
    open: false,
    onOpen: () => {
      settings.open = true;
      rerender();
    },
    onClose: () => {
      settings.open = false;
      rerender();
      restoreSettingsFocus();
    },
    onSave: (nextSettings) => {
      settings.current = normalizeUiSettings(nextSettings);
      settings.open = false;
      rerender();
      restoreSettingsFocus();
      void storage.save(settings.current);
    },
    onUpdate: (nextSettings) => {
      settings.current = normalizeUiSettings(nextSettings);
      rerender();
      void storage.save(settings.current);
    },
  };
  const stopObserving = observeChatGptPage(doc, (snapshot) => {
    latestSnapshot = snapshot;
    state.update(snapshot.url, snapshot.messages);
    syncChatExportActions(doc, snapshot, selection, settings);
  });
  void storage.load().then((storedSettings) => {
    if (disposed) return;
    settings.current = normalizeUiSettings(storedSettings);
    rerender();
  });

  return () => {
    disposed = true;
    stopObserving();
    for (const mount of doc.querySelectorAll<HTMLElement>(ACTION_MOUNT_SELECTOR)) {
      removeMount(mount);
    }
    for (const mount of doc.querySelectorAll<HTMLElement>(
      `${SELECTION_MOUNT_SELECTOR}, ${SELECTION_BAR_SELECTOR}`,
    )) {
      removeMount(mount);
    }
    for (const mount of doc.querySelectorAll<HTMLElement>(SETTINGS_MOUNT_SELECTOR)) {
      removeMount(mount);
    }
  };
}
