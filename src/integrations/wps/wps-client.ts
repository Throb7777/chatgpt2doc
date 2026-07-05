import {
  WPS_PROTOCOL_VERSION,
  type WpsBridgeResponse,
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
    return response.protocolVersion === WPS_PROTOCOL_VERSION && response.wpsInstalled
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
    || detail.includes('not allowed')
  ) {
    return 'host-forbidden';
  }
  return 'helper-failed';
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
      type: 'chat-export:wps-ping',
    }) as WpsBridgeResponse;
    return {
      capability: classifyHelperFailure(response),
      detail: response && !response.ok ? response.message : undefined,
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
