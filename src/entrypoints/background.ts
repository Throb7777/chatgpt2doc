import {
  isWpsBridgeRequest,
  type WpsBridgeResponse,
} from '../integrations/wps/protocol';
import { sendWpsNativeMessage } from '../integrations/wps/native-messaging';

function failure(error: unknown): WpsBridgeResponse {
  return {
    ok: false,
    error: 'helper-unavailable',
    message: error instanceof Error ? error.message : String(error),
  };
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (message: unknown) => {
    if (!isWpsBridgeRequest(message)) return undefined;
    try {
      if (message.type === 'chat-export:wps-permission-request') {
        return {
          ok: true,
          granted: await browser.permissions.request({ permissions: ['nativeMessaging'] }),
        };
      }
      if (message.type === 'chat-export:wps-permission-remove') {
        return {
          ok: true,
          removed: await browser.permissions.remove({ permissions: ['nativeMessaging'] }),
        };
      }
      if (message.type === 'chat-export:wps-permission-status') {
        return {
          ok: true,
          granted: await browser.permissions.contains({ permissions: ['nativeMessaging'] }),
        };
      }
      const nativeMessage = message.type === 'chat-export:wps-ping'
        ? { operation: 'ping' }
        : { operation: 'prepare-wps-clipboard', ...message.payload };
      return await sendWpsNativeMessage(nativeMessage);
    } catch (error) {
      return failure(error);
    }
  });
});
