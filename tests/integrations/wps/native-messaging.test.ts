import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendWpsNativeMessage } from '../../../src/integrations/wps/native-messaging';
import { WPS_NATIVE_HOST } from '../../../src/integrations/wps/protocol';

afterEach(() => vi.unstubAllGlobals());

describe('WPS Chromium native messaging dispatch', () => {
  it('uses the Chrome runtime when the browser wrapper lacks sendNativeMessage', async () => {
    const response = {
      ok: true,
      helperVersion: '0.1.0',
      protocolVersion: 1,
      wpsInstalled: true,
    } as const;
    const sendNativeMessage = vi.fn(async () => response);
    vi.stubGlobal('browser', { runtime: { id: 'wrapper-without-native-api' } });
    vi.stubGlobal('chrome', { runtime: { sendNativeMessage } });

    await expect(sendWpsNativeMessage({ operation: 'ping' })).resolves.toEqual(response);
    expect(sendNativeMessage).toHaveBeenCalledOnce();
    expect(sendNativeMessage).toHaveBeenCalledWith(WPS_NATIVE_HOST, { operation: 'ping' });
  });

  it('returns a precise error when the Chromium API is unavailable', async () => {
    vi.stubGlobal('browser', { runtime: { id: 'wrapper-without-native-api' } });
    vi.stubGlobal('chrome', { runtime: {} });

    await expect(sendWpsNativeMessage({ operation: 'ping' })).rejects.toThrow(
      'Chrome native messaging API is unavailable.',
    );
  });
});
