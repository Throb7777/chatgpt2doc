import { describe, expect, it } from 'vitest';

import {
  createDefaultSettingsStorage,
  DEFAULT_UI_SETTINGS,
  type SettingsStorageArea,
} from '../../src/settings/settings';

const LEGACY_SETTINGS_KEY = 'chatExport.settings.v1';
const SETTINGS_KEY = 'chatExport.settings.v2';

function installStorage(initial?: unknown, key = SETTINGS_KEY): {
  data: Map<string, unknown>;
  storage: SettingsStorageArea;
} {
  const data = new Map<string, unknown>();
  if (initial !== undefined) data.set(key, initial);
  const storage: SettingsStorageArea = {
    async get(key) {
      return data.has(key) ? { [key]: data.get(key) } : {};
    },
    async remove(key) {
      data.delete(key);
    },
    async set(value) {
      for (const [key, stored] of Object.entries(value)) data.set(key, stored);
    },
  };
  return { data, storage };
}

describe('validated settings storage', () => {
  it('loads defaults when no stored state exists', async () => {
    const { storage } = installStorage();

    await expect(createDefaultSettingsStorage(storage).load()).resolves.toEqual(
      DEFAULT_UI_SETTINGS,
    );
  });

  it('validates before save and survives a new storage instance', async () => {
    const { data, storage } = installStorage();
    const settingsStorage = createDefaultSettingsStorage(storage);
    await settingsStorage.save({
      codeStyle: 'dark',
      collectionMode: 'scan-complete',
      copyTarget: 'wps',
      defaultScope: 'recent-messages',
      fileName: 'research-export',
      includePrompts: false,
      language: 'zh-CN',
      panelCollapsed: true,
      panelPosition: { x: 123, y: 456 },
      paper: 'letter',
      recentCount: 25,
      showExportDiagnostics: true,
      showPerMessageActions: false,
      theme: 'dark',
      wpsEditableCopy: true,
    });

    await expect(createDefaultSettingsStorage(storage).load()).resolves.toEqual({
      codeStyle: 'dark',
      collectionMode: 'scan-complete',
      copyTarget: 'wps',
      defaultScope: 'recent-messages',
      fileName: 'research-export',
      includePrompts: false,
      language: 'zh-CN',
      panelCollapsed: true,
      panelPosition: { x: 123, y: 456 },
      paper: 'letter',
      recentCount: 25,
      showExportDiagnostics: true,
      showPerMessageActions: false,
      theme: 'dark',
      wpsEditableCopy: true,
    });
    expect(data.get(SETTINGS_KEY)).toEqual({
      settings: {
        codeStyle: 'dark',
        collectionMode: 'scan-complete',
        copyTarget: 'wps',
        defaultScope: 'recent-messages',
        fileName: 'research-export',
        includePrompts: false,
        language: 'zh-CN',
        panelCollapsed: true,
        panelPosition: { x: 123, y: 456 },
        paper: 'letter',
        recentCount: 25,
        showExportDiagnostics: true,
        showPerMessageActions: false,
        theme: 'dark',
        wpsEditableCopy: true,
      },
      version: 5,
    });
  });

  it('migrates the legacy raw object into the v2 envelope', async () => {
    const { data, storage } = installStorage({
      codeStyle: 'light',
      fileName: 'legacy',
      includePrompts: false,
      language: 'zh-CN',
      paper: 'letter',
      theme: 'dark',
    }, LEGACY_SETTINGS_KEY);

    await expect(createDefaultSettingsStorage(storage).load()).resolves.toEqual({
      codeStyle: 'light',
      collectionMode: 'visible-only',
      copyTarget: 'word',
      defaultScope: 'full-conversation',
      fileName: 'legacy',
      includePrompts: false,
      language: 'zh-CN',
      panelCollapsed: false,
      panelPosition: null,
      paper: 'letter',
      recentCount: 10,
      showExportDiagnostics: false,
      showPerMessageActions: true,
      theme: 'dark',
      wpsEditableCopy: false,
    });
    expect(data.get(SETTINGS_KEY)).toEqual({
      settings: {
        codeStyle: 'light',
        collectionMode: 'visible-only',
        copyTarget: 'word',
        defaultScope: 'full-conversation',
        fileName: 'legacy',
        includePrompts: false,
        language: 'zh-CN',
        panelCollapsed: false,
        panelPosition: null,
        paper: 'letter',
        recentCount: 10,
        showExportDiagnostics: false,
        showPerMessageActions: true,
        theme: 'dark',
        wpsEditableCopy: false,
      },
      version: 5,
    });
    expect(data.has(LEGACY_SETTINGS_KEY)).toBe(false);
  });

  it('repairs malformed versioned state with field defaults', async () => {
    const { data, storage } = installStorage({
      settings: {
        codeStyle: 'invalid',
        collectionMode: 'later',
        defaultScope: 'page',
        fileName: 42,
        includePrompts: 'yes',
        language: 'fr',
        panelCollapsed: 'no',
        panelPosition: { x: Number.NaN, y: 'far' },
        paper: 'legal',
        recentCount: 101,
        showExportDiagnostics: 'yes',
        showPerMessageActions: 'sometimes',
        theme: null,
      },
      version: 4,
    });

    await expect(createDefaultSettingsStorage(storage).load()).resolves.toEqual(
      DEFAULT_UI_SETTINGS,
    );
    expect(data.get(SETTINGS_KEY)).toEqual({
      settings: DEFAULT_UI_SETTINGS,
      version: 5,
    });
  });

  it('migrates the old A4 default to the reference Letter profile', async () => {
    const { data, storage } = installStorage({
      settings: {
        ...DEFAULT_UI_SETTINGS,
        paper: 'a4',
      },
      version: 2,
    });

    await expect(createDefaultSettingsStorage(storage).load()).resolves.toEqual({
      ...DEFAULT_UI_SETTINGS,
      paper: 'letter',
    });
    expect(data.get(SETTINGS_KEY)).toEqual({
      settings: {
        ...DEFAULT_UI_SETTINGS,
        paper: 'letter',
      },
      version: 5,
    });
  });

  it('removes persisted state and returns defaults on reset', async () => {
    const { data, storage } = installStorage({
      settings: {
        ...DEFAULT_UI_SETTINGS,
        paper: 'letter',
      },
      version: 1,
    });
    const settingsStorage = createDefaultSettingsStorage(storage);

    await expect(settingsStorage.reset()).resolves.toEqual(DEFAULT_UI_SETTINGS);
    expect(data.has(SETTINGS_KEY)).toBe(false);
    await expect(settingsStorage.load()).resolves.toEqual(DEFAULT_UI_SETTINGS);
  });
});
