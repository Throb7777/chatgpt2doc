import {
  WPS_PROTOCOL_VERSION,
  type WpsBridgeResponse,
  type WpsHelperDiagnostics,
  type WpsPrepareRequest,
} from './protocol';

export type WpsCapability =
  | 'helper-failed'
  | 'host-forbidden'
  | 'host-not-found'
  | 'permission-denied'
  | 'permission-needed'
  | 'ready'
  | 'unavailable';

export interface WpsHelperStatus {
  capability: WpsCapability;
  detail?: string;
  diagnostics?: WpsHelperDiagnostics;
  wpsInstalled?: boolean;
}

function extensionBrowser(): typeof browser {
  return (globalThis as typeof globalThis & { browser: typeof browser }).browser;
}

async function permissionMessage(
  type: 'chat-export:wps-permission-remove'
    | 'chat-export:wps-permission-request'
    | 'chat-export:wps-permission-status',
): Promise<{ granted?: boolean; ok?: boolean; removed?: boolean } | undefined> {
  return await extensionBrowser().runtime.sendMessage({ type });
}

export async function requestWpsPermission(): Promise<boolean> {
  try {
    return (await permissionMessage('chat-export:wps-permission-request'))?.granted === true;
  } catch {
    return false;
  }
}

export function getExtensionId(): string {
  try {
    return extensionBrowser().runtime.id;
  } catch {
    return '';
  }
}

function classifyHelperFailure(response: WpsBridgeResponse | undefined): WpsCapability {
  if (!response) return 'helper-failed';
  if (response.ok) {
    return response.protocolVersion === WPS_PROTOCOL_VERSION
      ? 'ready'
      : 'unavailable';
  }
  const detail = `${response.error} ${response.message}`.toLowerCase();
  if (
    detail.includes('host not found')
    || detail.includes('native messaging host not found')
    || detail.includes('specified native messaging host not found')
    || detail.includes('no such native application')
  ) {
    return 'host-not-found';
  }
  if (
    detail.includes('forbidden')
    || detail.includes('access to the specified native messaging host')
    || detail.includes('not listed in allowed_origins')
    || detail.includes('not allowed')
    || detail.includes('permission denied')
    || detail.includes('access denied')
    || detail.includes('拒绝')
    || detail.includes('禁止')
    || detail.includes('不允许')
  ) {
    return 'host-forbidden';
  }
  return 'helper-failed';
}

function classifySuccessfulHelper(response: WpsBridgeResponse): WpsCapability {
  if (!response.ok) return classifyHelperFailure(response);
  return response.protocolVersion === WPS_PROTOCOL_VERSION
    ? 'ready'
    : 'unavailable';
}

export async function removeWpsPermission(): Promise<void> {
  try {
    await permissionMessage('chat-export:wps-permission-remove');
  } catch {
    // The setting is still disabled even if Chrome cannot remove the grant.
  }
}

export async function inspectWpsHelper(): Promise<WpsHelperStatus> {
  try {
    const api = extensionBrowser();
    const permitted = (await permissionMessage('chat-export:wps-permission-status'))
      ?.granted === true;
    if (!permitted) return { capability: 'permission-needed' };
    const response = await api.runtime.sendMessage({
      type: 'chat-export:wps-diagnose',
    }) as WpsBridgeResponse;
    if (!response?.ok && response?.error === 'unsupported-operation') {
      const pingResponse = await api.runtime.sendMessage({
        type: 'chat-export:wps-ping',
      }) as WpsBridgeResponse;
      return {
        capability: classifyHelperFailure(pingResponse),
        detail: pingResponse && !pingResponse.ok ? pingResponse.message : undefined,
        wpsInstalled: pingResponse?.ok ? pingResponse.wpsInstalled : undefined,
      };
    }
    return {
      capability: response?.ok ? classifySuccessfulHelper(response) : classifyHelperFailure(response),
      detail: response && !response.ok ? response.message : undefined,
      diagnostics: response?.ok ? response.diagnostics : undefined,
      wpsInstalled: response?.ok ? response.wpsInstalled : undefined,
    };
  } catch (error) {
    return {
      capability: 'helper-failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function pingWpsHelper(): Promise<WpsCapability> {
  return (await inspectWpsHelper()).capability;
}

export async function prepareWpsClipboard(
  payload: WpsPrepareRequest['payload'],
): Promise<WpsBridgeResponse> {
  try {
    const response = await extensionBrowser().runtime.sendMessage({
      type: 'chat-export:wps-prepare',
      payload,
    } satisfies WpsPrepareRequest) as WpsBridgeResponse | undefined;
    return response ?? {
      ok: false,
      error: 'bridge-failure',
      message: 'The WPS helper did not return a response.',
    };
  } catch (error) {
    return {
      ok: false,
      error: 'bridge-failure',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
