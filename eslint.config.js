import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '.output/**',
    '.reference-private/**',
    '.wxt/**',
    'node_modules/**',
    'tmp/**',
  ]),
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        defineBackground: 'readonly',
        defineContentScript: 'readonly',
      },
    },
  },
]);
