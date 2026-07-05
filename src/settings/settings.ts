import type {
  ExportLanguage,
  ExportOptions,
} from '../document/export';

export type DefaultExportScope = 'full-conversation' | 'recent-messages';
export type DefaultCollectionMode = 'scan-complete' | 'visible-only';
export type ClipboardTarget = 'word' | 'wps';

export interface FloatingPanelPosition {
  x: number;
  y: number;
}

export interface UiSettings {
  codeStyle: ExportOptions['codeStyle'];
  collectionMode: DefaultCollectionMode;
  copyTarget: ClipboardTarget;
  defaultScope: DefaultExportScope;
  fileName: string;
  includePrompts: boolean;
  language: ExportLanguage;
  panelCollapsed: boolean;
  panelPosition: FloatingPanelPosition | null;
  paper: ExportOptions['paper'];
  recentCount: number;
  showExportDiagnostics: boolean;
  showPerMessageActions: boolean;
  theme: ExportOptions['theme'];
  /** @deprecated Use copyTarget === 'wps'. Kept for migration and narrow existing call sites. */
  wpsEditableCopy: boolean;
}

export const DEFAULT_UI_SETTINGS: UiSettings = {
  codeStyle: 'document',
  collectionMode: 'visible-only',
  copyTarget: 'word',
  defaultScope: 'full-conversation',
  fileName: '',
  includePrompts: true,
  language: 'en',
  panelCollapsed: false,
  panelPosition: null,
  paper: 'letter',
  recentCount: 10,
  showExportDiagnostics: false,
  showPerMessageActions: true,
  theme: 'light',
  wpsEditableCopy: false,
};

export interface SettingsStorage {
  load(): Promise<UiSettings>;
  reset(): Promise<UiSettings>;
  save(settings: UiSettings): Promise<void>;
}

export interface SettingsStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  remove(key: string): Promise<void>;
  set(value: Record<string, unknown>): Promise<void>;
}

const LEGACY_SETTINGS_KEY = 'chatExport.settings.v1';
const SETTINGS_KEY = 'chatExport.settings.v2';
const SETTINGS_VERSION = 5;

interface StoredSettings {
  settings: UiSettings;
  version: 1 | 2 | typeof SETTINGS_VERSION;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T)
    ? value as T
    : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

function normalizedPanelPosition(value: unknown): FloatingPanelPosition | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<FloatingPanelPosition>;
  if (
    typeof candidate.x !== 'number'
    || typeof candidate.y !== 'number'
    || !Number.isFinite(candidate.x)
    || !Number.isFinite(candidate.y)
  ) {
    return null;
  }
  return {
    x: Math.round(Math.max(0, Math.min(candidate.x, 10000))),
    y: Math.round(Math.max(0, Math.min(candidate.y, 10000))),
  };
}

export function normalizeUiSettings(value: unknown): UiSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_UI_SETTINGS };
  const candidate = value as Partial<UiSettings>;
  return {
    codeStyle: oneOf(candidate.codeStyle, ['document', 'dark', 'light'], 'document'),
    collectionMode: oneOf(candidate.collectionMode, ['scan-complete', 'visible-only'], 'visible-only'),
    copyTarget: oneOf(
      candidate.copyTarget,
      ['word', 'wps'],
      candidate.wpsEditableCopy === true ? 'wps' : 'word',
    ),
    defaultScope: oneOf(candidate.defaultScope, ['full-conversation', 'recent-messages'], 'full-conversation'),
    fileName: typeof candidate.fileName === 'string' ? candidate.fileName : '',
    includePrompts: typeof candidate.includePrompts === 'boolean'
      ? candidate.includePrompts
      : true,
    language: oneOf(candidate.language, ['en', 'zh-CN'], 'en'),
    panelCollapsed: typeof candidate.panelCollapsed === 'boolean'
      ? candidate.panelCollapsed
      : false,
    panelPosition: normalizedPanelPosition(candidate.panelPosition),
    paper: oneOf(candidate.paper, ['a4', 'letter'], 'letter'),
    recentCount: boundedInteger(candidate.recentCount, 10, 1, 100),
    showExportDiagnostics: typeof candidate.showExportDiagnostics === 'boolean'
      ? candidate.showExportDiagnostics
      : false,
    showPerMessageActions: typeof candidate.showPerMessageActions === 'boolean'
      ? candidate.showPerMessageActions
      : true,
    theme: oneOf(candidate.theme, ['dark', 'light'], 'light'),
    wpsEditableCopy: oneOf(
      candidate.copyTarget,
      ['word', 'wps'],
      candidate.wpsEditableCopy === true ? 'wps' : 'word',
    ) === 'wps',
  };
}

function storedSettings(settings: UiSettings): StoredSettings {
  return {
    settings: normalizeUiSettings(settings),
    version: SETTINGS_VERSION,
  };
}

function readStoredSettings(value: unknown): {
  migrated: boolean;
  settings: UiSettings;
} {
  if (
    value
    && typeof value === 'object'
    && typeof (value as Partial<StoredSettings>).version === 'number'
    && 'settings' in value
  ) {
    const version = (value as Partial<StoredSettings>).version;
    const settings = normalizeUiSettings((value as Partial<StoredSettings>).settings);
    const migratedSettings = version === 2 && settings.paper === 'a4'
      ? { ...settings, paper: 'letter' as const }
      : settings;
    return {
      migrated: version !== SETTINGS_VERSION
        || JSON.stringify(value) !== JSON.stringify(storedSettings(migratedSettings)),
      settings: migratedSettings,
    };
  }
  return {
    migrated: value !== undefined,
    settings: normalizeUiSettings(value),
  };
}

let fallbackSettings = { ...DEFAULT_UI_SETTINGS };

export function createDefaultSettingsStorage(
  storageArea?: SettingsStorageArea | null,
): SettingsStorage {
  const extensionStorage = storageArea
    ?? (typeof browser === 'undefined'
      ? null
      : browser.storage?.local as SettingsStorageArea | undefined);
  if (!extensionStorage) {
    return {
      load: async () => ({ ...fallbackSettings }),
      reset: async () => {
        fallbackSettings = { ...DEFAULT_UI_SETTINGS };
        return { ...fallbackSettings };
      },
      save: async (settings) => {
        fallbackSettings = normalizeUiSettings(settings);
      },
    };
  }

  return {
    load: async () => {
      const stored = await extensionStorage.get(SETTINGS_KEY);
      let result = readStoredSettings(stored[SETTINGS_KEY]);
      const hasCurrent = stored[SETTINGS_KEY] !== undefined;
      if (!hasCurrent) {
        const legacyStored = await extensionStorage.get(LEGACY_SETTINGS_KEY);
        result = readStoredSettings(legacyStored[LEGACY_SETTINGS_KEY]);
        if (legacyStored[LEGACY_SETTINGS_KEY] !== undefined) {
          await extensionStorage.remove(LEGACY_SETTINGS_KEY);
          await extensionStorage.set({ [SETTINGS_KEY]: storedSettings(result.settings) });
          return result.settings;
        }
      }
      if (result.migrated) {
        await extensionStorage.set({ [SETTINGS_KEY]: storedSettings(result.settings) });
      }
      return result.settings;
    },
    reset: async () => {
      await extensionStorage.remove(SETTINGS_KEY);
      return { ...DEFAULT_UI_SETTINGS };
    },
    save: async (settings) => {
      await extensionStorage.set({ [SETTINGS_KEY]: storedSettings(settings) });
    },
  };
}
