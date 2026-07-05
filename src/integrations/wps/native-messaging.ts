import {
  WPS_NATIVE_HOST,
  type WpsBridgeResponse,
} from './protocol';

interface ChromiumNativeRuntime {
  sendNativeMessage(
    application: string,
    message: Record<string, unknown>,
  ): Promise<unknown>;
}

function chromiumNativeRuntime(): ChromiumNativeRuntime {
  const runtime = (globalThis as typeof globalThis & {
    chrome?: { runtime?: Partial<ChromiumNativeRuntime> };
  }).chrome?.runtime;
  if (typeof runtime?.sendNativeMessage !== 'function') {
    throw new Error('Chrome native messaging API is unavailable.');
  }
  return runtime as ChromiumNativeRuntime;
}

export async function sendWpsNativeMessage(
  message: Record<string, unknown>,
): Promise<WpsBridgeResponse> {
  const runtime = chromiumNativeRuntime();
  return await runtime.sendNativeMessage(WPS_NATIVE_HOST, message) as WpsBridgeResponse;
}
