import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getExtensionId,
  inspectWpsHelper,
  pingWpsHelper,
  prepareWpsClipboard,
  requestWpsPermission,
} from '../../../src/integrations/wps/wps-client';

afterEach(() => vi.unstubAllGlobals());

function installBrowser(options: {
  granted?: boolean;
  response?: unknown;
}) {
  const sendMessage = vi.fn(async (message: { type?: string }) => {
    if (message.type === 'chat-export:wps-permission-status') {
      return { ok: true, granted: options.granted ?? false };
    }
    if (message.type === 'chat-export:wps-permission-request') {
      return { ok: true, granted: options.granted ?? false };
    }
    if (message.type === 'chat-export:wps-permission-remove') {
      return { ok: true, removed: true };
    }
    return options.response;
  });
  vi.stubGlobal('browser', {
    runtime: {
      id: 'abcdefghijklmnopabcdefghijklmnop',
      sendMessage,
    },
  });
  return { sendMessage };
}

describe('WPS integration client', () => {
  it('does not probe the helper before optional permission is granted', async () => {
    const { sendMessage } = installBrowser({ granted: false });
    await expect(pingWpsHelper()).resolves.toBe('permission-needed');
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it('recognizes a matching local helper', async () => {
    installBrowser({
      granted: true,
      response: {
        ok: true,
        diagnostics: {
          allowedExtensionIds: ['abcdefghijklmnopabcdefghijklmnop'],
          allowedOrigins: ['chrome-extension://abcdefghijklmnopabcdefghijklmnop/'],
          executablePath: 'C:\\Users\\Test\\AppData\\Local\\ChatGPT2Doc\\WpsHelper\\ChatExportWpsHost.exe',
          installPath: 'C:\\Users\\Test\\AppData\\Local\\ChatGPT2Doc\\WpsHelper',
          manifestPath: 'C:\\Users\\Test\\AppData\\Local\\ChatGPT2Doc\\WpsHelper\\com.chat_export_local.wps.json',
        },
        helperVersion: '0.1.0',
        protocolVersion: 1,
        wpsInstalled: true,
      },
    });
    await expect(pingWpsHelper()).resolves.toBe('ready');
    await expect(inspectWpsHelper()).resolves.toMatchObject({
      capability: 'ready',
      diagnostics: {
        allowedExtensionIds: ['abcdefghijklmnopabcdefghijklmnop'],
      },
      wpsInstalled: true,
    });
    await expect(requestWpsPermission()).resolves.toBe(true);
    expect(getExtensionId()).toBe('abcdefghijklmnopabcdefghijklmnop');
  });

  it('falls back to ping when an older helper lacks diagnose', async () => {
    let requestCount = 0;
    const sendMessage = vi.fn(async (message: { type?: string }) => {
      if (message.type === 'chat-export:wps-permission-status') {
        return { ok: true, granted: true };
      }
      requestCount += 1;
      return requestCount === 1
        ? { ok: false, error: 'unsupported-operation', message: 'The requested operation is not supported.' }
        : { ok: true, helperVersion: '0.1.0', protocolVersion: 1, wpsInstalled: true };
    });
    vi.stubGlobal('browser', {
      runtime: {
        id: 'abcdefghijklmnopabcdefghijklmnop',
        sendMessage,
      },
    });

    await expect(inspectWpsHelper()).resolves.toEqual({
      capability: 'ready',
      detail: undefined,
      wpsInstalled: true,
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'chat-export:wps-diagnose' });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'chat-export:wps-ping' });
  });

  it('distinguishes an unregistered host from an extension ID mismatch', async () => {
    installBrowser({
      granted: true,
      response: {
        ok: false,
        error: 'helper-unavailable',
        message: 'Specified native messaging host not found.',
      },
    });
    await expect(inspectWpsHelper()).resolves.toEqual({
      capability: 'host-not-found',
      detail: 'Specified native messaging host not found.',
    });

    installBrowser({
      granted: true,
      response: {
        ok: false,
        error: 'helper-unavailable',
        message: 'Access to the specified native messaging host is forbidden.',
      },
    });
    await expect(pingWpsHelper()).resolves.toBe('host-forbidden');
  });

  it('treats WPS COM detection as diagnostic instead of a helper readiness gate', async () => {
    installBrowser({
      granted: true,
      response: {
        ok: true,
        diagnostics: {
          allowedExtensionIds: ['abcdefghijklmnopabcdefghijklmnop'],
          allowedOrigins: ['chrome-extension://abcdefghijklmnopabcdefghijklmnop/'],
          executablePath: 'C:\\Users\\Test\\AppData\\Local\\ChatGPT2Doc\\WpsHelper\\ChatExportWpsHost.exe',
          installPath: 'C:\\Users\\Test\\AppData\\Local\\ChatGPT2Doc\\WpsHelper',
          manifestPath: 'C:\\Users\\Test\\AppData\\Local\\ChatGPT2Doc\\WpsHelper\\com.chat_export_local.wps.json',
        },
        helperVersion: '0.1.0',
        protocolVersion: 1,
        wpsInstalled: false,
      },
    });

    await expect(inspectWpsHelper()).resolves.toMatchObject({
      capability: 'ready',
      wpsInstalled: false,
    });
  });

  it('returns a bounded failure without changing the Word clipboard path', async () => {
    installBrowser({ granted: true, response: undefined });
    await expect(prepareWpsClipboard({
      docxBase64: 'UEs=',
      html: '<p>x</p>',
      text: 'x',
    })).resolves.toMatchObject({ ok: false, error: 'bridge-failure' });
  });
});
