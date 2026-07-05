export const WPS_NATIVE_HOST = 'com.chat_export_local.wps';
export const WPS_PROTOCOL_VERSION = 1;

export interface WpsPingRequest {
  type: 'chat-export:wps-ping';
}

export interface WpsPermissionRequest {
  type: 'chat-export:wps-permission-request';
}

export interface WpsPermissionRemoveRequest {
  type: 'chat-export:wps-permission-remove';
}

export interface WpsPermissionStatusRequest {
  type: 'chat-export:wps-permission-status';
}

export interface WpsPrepareRequest {
  type: 'chat-export:wps-prepare';
  payload: {
    docxBase64: string;
    html: string;
    text: string;
  };
}

export type WpsBridgeRequest =
  | WpsPermissionRemoveRequest
  | WpsPermissionRequest
  | WpsPermissionStatusRequest
  | WpsPingRequest
  | WpsPrepareRequest;

export type WpsBridgeResponse =
  | {
    ok: true;
    equationCount?: number;
    helperVersion: string;
    packageBytes?: number;
    protocolVersion: number;
    wpsInstalled: boolean;
  }
  | {
    ok: false;
    error: string;
    message: string;
  };

export function isWpsBridgeRequest(value: unknown): value is WpsBridgeRequest {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return type === 'chat-export:wps-ping'
    || type === 'chat-export:wps-prepare'
    || type === 'chat-export:wps-permission-request'
    || type === 'chat-export:wps-permission-remove'
    || type === 'chat-export:wps-permission-status';
}
