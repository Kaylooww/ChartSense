import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Chrome APIs that would allow page injection, traffic interception, credential access or
// request rewriting. ChartSense is analysis-only (see PROJECT_CONTEXT.md section 0, rule 4),
// so these are banned outright. Do not add exceptions without updating docs/DECISIONS.md.
const bannedChromeApis = ['scripting', 'debugger', 'webRequest', 'cookies', 'declarativeNetRequest', 'webNavigation'];

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, chrome: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': [
        'error',
        ...bannedChromeApis.map((api) => ({
          object: 'chrome',
          property: api,
          message: `chrome.${api} is banned: ChartSense must not inject into, intercept or automate trading sites.`,
        })),
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
