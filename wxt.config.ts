import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'ChatGPT2Doc',
    description: 'Export ChatGPT conversations locally to editable DOCX and searchable PDF.',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    permissions: ['storage'],
    optional_permissions: ['nativeMessaging'],
    web_accessible_resources: [{
      matches: ['https://chatgpt.com/*'],
      resources: ['fonts/*.ttf'],
    }],
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
  },
  vite: () => ({
    define: {
      __CHAT_EXPORT_BUILD_ID__: JSON.stringify(process.env.CHAT_EXPORT_BUILD_ID ?? 'local-dev'),
      __CHAT_EXPORT_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
    },
    plugins: [preact()],
  }),
});
