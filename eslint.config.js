import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-android/**', 'android/**', '**/node_modules/**', 'data/**', 'test-results/**', 'android/**', 'apps/phone/public/sw.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['**/*.{js,mjs}'], languageOptions: { globals: globals.node } },
  // Playwright scripts run some code inside the page.
  { files: ['scripts/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
);
