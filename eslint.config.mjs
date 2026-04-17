import { defineConfig, globalIgnores } from 'eslint/config';

const nodeGlobals = {
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  Blob: 'readonly',
  Buffer: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  process: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

export default defineConfig([
  globalIgnores([
    'dashboard/**',
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
  ]),
  {
    files: [
      'event-bus/**/*.js',
      'disruption/**/*.js',
      'impact/**/*.js',
      'resolution/**/*.js',
      'news-intel/**/*.js',
      'shared/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
]);