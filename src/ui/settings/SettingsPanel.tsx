import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import {
  DEFAULT_UI_SETTINGS,
  type UiSettings,
} from '../../settings/settings';
import {
  getExtensionId,
  inspectWpsHelper,
  removeWpsPermission,
  requestWpsPermission,
  type WpsCapability,
} from '../../integrations/wps/wps-client';
import type { WpsHelperDiagnostics } from '../../integrations/wps/protocol';
import { getUiStrings } from '../i18n';

interface SettingsPanelProps {
  onClose: () => void;
  onSave: (settings: UiSettings) => void;
  settings: UiSettings;
}

export function SettingsPanel({
  onClose,
  onSave,
  settings,
}: SettingsPanelProps) {
  const [draft, setDraft] = useState(settings);
  const [wpsStatus, setWpsStatus] = useState<WpsCapability | 'checking' | 'off'>(
    settings.copyTarget === 'wps' ? 'checking' : 'off',
  );
  const [wpsStatusDetail, setWpsStatusDetail] = useState('');
  const [wpsDiagnostics, setWpsDiagnostics] = useState<WpsHelperDiagnostics | undefined>();
  const [extensionIdCopied, setExtensionIdCopied] = useState(false);
  const languageRef = useRef<HTMLSelectElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const strings = getUiStrings(draft.language);
  const extensionId = getExtensionId();

  useEffect(() => {
    if (settings.copyTarget !== 'wps') return;
    let active = true;
    void inspectWpsHelper().then((status) => {
      if (!active) return;
      setWpsStatus(status.capability);
      setWpsStatusDetail(status.detail ?? '');
      setWpsDiagnostics(status.diagnostics);
    });
    return () => { active = false; };
  }, [settings.copyTarget]);

  const selectCopyTarget = async (target: UiSettings['copyTarget']) => {
    if (target === 'word') {
      await removeWpsPermission();
      setDraft((current) => ({ ...current, copyTarget: 'word', wpsEditableCopy: false }));
      setWpsStatus('off');
      setWpsStatusDetail('');
      setWpsDiagnostics(undefined);
      return;
    }
    setWpsStatus('checking');
    setWpsStatusDetail('');
    setWpsDiagnostics(undefined);
    setDraft((current) => ({ ...current, copyTarget: 'wps', wpsEditableCopy: true }));
    if (!await requestWpsPermission()) {
      setWpsStatus('permission-denied');
      setWpsStatusDetail('');
      setWpsDiagnostics(undefined);
      return;
    }
    const status = await inspectWpsHelper();
    setWpsStatus(status.capability);
    setWpsStatusDetail(status.detail ?? '');
    setWpsDiagnostics(status.diagnostics);
  };

  const recheckWps = async () => {
    setWpsStatus('checking');
    setWpsStatusDetail('');
    setWpsDiagnostics(undefined);
    const status = await inspectWpsHelper();
    setWpsStatus(status.capability);
    setWpsStatusDetail(status.detail ?? '');
    setWpsDiagnostics(status.diagnostics);
  };

  const copyExtensionId = async () => {
    if (!extensionId || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(extensionId);
    setExtensionIdCopied(true);
    window.setTimeout(() => setExtensionIdCopied(false), 1600);
  };

  const openWpsHelperDownload = () => {
    window.open(
      'https://github.com/Throb7777/chatgpt2doc/releases/tag/v1.0.0',
      '_blank',
      'noopener,noreferrer',
    );
  };

  const wpsStatusLabel = (() => {
    switch (wpsStatus) {
      case 'checking':
        return strings.wpsStatusChecking;
      case 'helper-failed':
        return strings.wpsStatusHelperFailed;
      case 'host-forbidden':
        return strings.wpsStatusHostForbidden;
      case 'host-not-found':
        return strings.wpsStatusHostNotFound;
      case 'permission-denied':
        return strings.wpsStatusDenied;
      case 'permission-needed':
        return strings.wpsStatusPermissionNeeded;
      case 'ready':
        return strings.wpsStatusReady;
      case 'unavailable':
        return strings.wpsStatusUnavailable;
      case 'off':
      default:
        return strings.wpsStatusOff;
    }
  })();

  const helperNeedsInstall = wpsStatus === 'host-not-found' || wpsStatus === 'unavailable';
  const helperNeedsRebind = wpsStatus === 'host-forbidden';
  const helperBoundIds = wpsDiagnostics?.allowedExtensionIds ?? [];
  const helperBindingMatches = extensionId
    ? helperBoundIds.includes(extensionId)
    : false;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    languageRef.current?.focus();
    if (!panel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = [...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), '
        + '[tabindex]:not([tabindex="-1"])',
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && (event.target === first || !panel.contains(event.target as Node))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && event.target === last) {
        event.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div class="chat-export-settings-backdrop">
      <section
        aria-label={strings.settingsTitle}
        aria-modal="true"
        class="chat-export-settings-panel"
        ref={panelRef}
        role="dialog"
      >
        <h2>{strings.settingsTitle}</h2>
        <fieldset class="chat-export-settings-section">
          <legend>{strings.contentSettings}</legend>
        <label>
          <span>{strings.language}</span>
          <select
            onInput={(event) => setDraft((current) => ({
              ...current,
              language: event.currentTarget.value as UiSettings['language'],
            }))}
            ref={languageRef}
            value={draft.language}
          >
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
          </select>
        </label>
        <label>
          <span>{strings.fileName}</span>
          <input
            onInput={(event) => setDraft((current) => ({
              ...current,
              fileName: event.currentTarget.value,
            }))}
            placeholder={strings.fileNamePlaceholder}
            type="text"
            value={draft.fileName}
          />
        </label>
        <label>
          <span>{strings.paper}</span>
          <select
            onInput={(event) => setDraft((current) => ({
              ...current,
              paper: event.currentTarget.value as UiSettings['paper'],
            }))}
            value={draft.paper}
          >
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </label>
        <label>
          <span>{strings.theme}</span>
          <select
            onInput={(event) => setDraft((current) => ({
              ...current,
              theme: event.currentTarget.value as UiSettings['theme'],
            }))}
            value={draft.theme}
          >
            <option value="light">{strings.themeLight}</option>
            <option value="dark">{strings.themeDark}</option>
          </select>
        </label>
        <label>
          <span>{strings.codeStyle}</span>
          <select
            onInput={(event) => setDraft((current) => ({
              ...current,
              codeStyle: event.currentTarget.value as UiSettings['codeStyle'],
            }))}
            value={draft.codeStyle}
          >
            <option value="document">{strings.codeStyleDocument}</option>
            <option value="light">{strings.codeStyleLight}</option>
            <option value="dark">{strings.codeStyleDark}</option>
          </select>
        </label>
        <label class="chat-export-settings-checkbox">
          <input
            checked={draft.includePrompts}
            onChange={(event) => setDraft((current) => ({
              ...current,
              includePrompts: event.currentTarget.checked,
            }))}
            type="checkbox"
          />
          <span>{strings.includePrompts}</span>
        </label>
        </fieldset>
        <fieldset class="chat-export-settings-section">
          <legend>{strings.quickExport}</legend>
          <label>
            <span>{strings.defaultScope}</span>
            <select
              onInput={(event) => setDraft((current) => ({
                ...current,
                defaultScope: event.currentTarget.value as UiSettings['defaultScope'],
              }))}
              value={draft.defaultScope}
            >
              <option value="full-conversation">{strings.scopeFullConversation}</option>
              <option value="recent-messages">{strings.scopeRecentMessages}</option>
            </select>
          </label>
          <label>
            <span>{strings.collectionMode}</span>
            <select
              onInput={(event) => setDraft((current) => ({
                ...current,
                collectionMode: event.currentTarget.value as UiSettings['collectionMode'],
              }))}
              value={draft.collectionMode}
            >
              <option value="visible-only">{strings.collectionModeVisibleOnly}</option>
              <option value="scan-complete">{strings.collectionModeScanComplete}</option>
            </select>
          </label>
          <label>
            <span>{strings.recentCount}</span>
            <input
              max={100}
              min={1}
              onInput={(event) => setDraft((current) => ({
                ...current,
                recentCount: Number.parseInt(event.currentTarget.value, 10),
              }))}
              type="number"
              value={draft.recentCount}
            />
          </label>
        </fieldset>
        <fieldset class="chat-export-settings-section">
          <legend>{strings.interfaceSettings}</legend>
          <label class="chat-export-settings-checkbox">
            <input
              checked={draft.panelCollapsed}
              onChange={(event) => setDraft((current) => ({
                ...current,
                panelCollapsed: event.currentTarget.checked,
              }))}
              type="checkbox"
            />
            <span>{strings.panelCollapsed}</span>
          </label>
          <label class="chat-export-settings-checkbox">
            <input
              checked={draft.showPerMessageActions}
              onChange={(event) => setDraft((current) => ({
                ...current,
                showPerMessageActions: event.currentTarget.checked,
              }))}
              type="checkbox"
            />
            <span>{strings.showPerMessageActions}</span>
          </label>
          <label class="chat-export-settings-checkbox">
            <input
              checked={draft.showExportDiagnostics}
              onChange={(event) => setDraft((current) => ({
                ...current,
                showExportDiagnostics: event.currentTarget.checked,
              }))}
              type="checkbox"
            />
            <span>{strings.showExportDiagnostics}</span>
          </label>
        </fieldset>
        <fieldset class="chat-export-settings-section">
          <legend>{strings.copyTarget}</legend>
          <div class="chat-export-settings-integration">
            <div class="chat-export-settings-integration-header">
              <span class="chat-export-settings-integration-title">{strings.copyTarget}</span>
              <span class="chat-export-settings-integration-status">{wpsStatusLabel}</span>
            </div>
            <div class="chat-export-copy-targets" role="radiogroup" aria-label={strings.copyTarget}>
              <label class="chat-export-copy-target">
                <input
                  checked={draft.copyTarget === 'word'}
                  name="chat-export-copy-target"
                  onChange={() => void selectCopyTarget('word')}
                  type="radio"
                />
                <span>
                  <strong>{strings.copyTargetWord}</strong>
                  <small>{strings.copyTargetWordDescription}</small>
                </span>
              </label>
              <label class="chat-export-copy-target">
                <input
                  checked={draft.copyTarget === 'wps'}
                  name="chat-export-copy-target"
                  onChange={() => void selectCopyTarget('wps')}
                  type="radio"
                />
                <span>
                  <strong>{strings.copyTargetWps}</strong>
                  <small>{strings.copyTargetWpsDescription}</small>
                </span>
              </label>
            </div>
            <p>{strings.wpsWordUnchanged}</p>
            {helperNeedsInstall ? <p>{strings.wpsInstallHint}</p> : null}
            {helperNeedsRebind ? <p>{strings.wpsRebindHint}</p> : null}
            {wpsStatusDetail ? (
              <p class="chat-export-settings-diagnostic">{wpsStatusDetail}</p>
            ) : null}
            {draft.copyTarget === 'wps' && extensionId ? (
              <div class="chat-export-extension-id">
                <span>{strings.currentExtensionId}</span>
                <code>{extensionId}</code>
                <button
                  class="chat-export-action-button"
                  onClick={() => void copyExtensionId()}
                  type="button"
                >
                  {extensionIdCopied ? strings.extensionIdCopied : strings.copyExtensionId}
                </button>
              </div>
            ) : null}
            {draft.copyTarget === 'wps' && wpsDiagnostics ? (
              <div class="chat-export-helper-diagnostics">
                <span>{strings.wpsBoundExtensionIds}</span>
                <code>{helperBoundIds.length > 0 ? helperBoundIds.join(', ') : '—'}</code>
                <p
                  class={helperBindingMatches
                    ? 'chat-export-settings-ok'
                    : 'chat-export-settings-warning'}
                >
                  {helperBindingMatches ? strings.wpsBindingMatches : strings.wpsBindingMismatch}
                </p>
                <span>{strings.wpsHelperInstallPath}</span>
                <code>{wpsDiagnostics.installPath || '—'}</code>
              </div>
            ) : null}
            {draft.copyTarget === 'wps' ? (
              <div class="chat-export-settings-helper-actions">
                <button
                  class="chat-export-action-button"
                  onClick={openWpsHelperDownload}
                  type="button"
                >
                  {strings.wpsDownloadHelper}
                </button>
                <button
                  class="chat-export-action-button"
                  disabled={wpsStatus === 'checking'}
                  onClick={() => void recheckWps()}
                  type="button"
                >
                  {strings.wpsCheckAgain}
                </button>
              </div>
            ) : null}
          </div>
        </fieldset>
        <div class="chat-export-settings-actions">
          <button
            class="chat-export-action-button"
            onClick={() => setDraft({ ...DEFAULT_UI_SETTINGS })}
            type="button"
          >
            {strings.reset}
          </button>
          <button class="chat-export-action-button" onClick={onClose} type="button">
            {strings.cancel}
          </button>
          <button
            class="chat-export-action-button"
            onClick={() => onSave({
              ...draft,
              wpsEditableCopy: draft.copyTarget === 'wps',
            })}
            type="button"
          >
            {strings.save}
          </button>
        </div>
      </section>
    </div>
  );
}
