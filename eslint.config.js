const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
      'spikes/**', // spikes are throwaway
    ],
  },
  // Global options
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
  },
  // Rules for all TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // Ban hardcoded hex colors outside the theme layer — every UI color must
  // route through `tokens` (apps/mobile/src/theme) so the app can theme (and,
  // when the dark-mode ThemeProvider lands, retheme) consistently. Pure black
  // (#000 / #000000) is allowed for shadows/overlays. Exempt: the theme layer
  // itself, motion art constants, illustration art (collectionIcons, the
  // technique glyphs), and RootErrorBoundary — a startup fallback deliberately
  // token-free so it renders even when the theme is what failed.
  {
    files: ['apps/mobile/src/**/*.ts', 'apps/mobile/src/**/*.tsx'],
    ignores: [
      'apps/mobile/src/theme/**',
      'apps/mobile/src/motion/**',
      'apps/mobile/src/**/collectionIcons.tsx',
      'apps/mobile/src/components/brandGlyphs.technique.tsx',
      'apps/mobile/src/components/RootErrorBoundary.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?!000$)(?!000000$)[0-9a-fA-F]{3,8}$/i]',
          message:
            'Hardcoded hex color — route UI colors through `tokens` (apps/mobile/src/theme). Pure black is allowed for shadows; art/motion files are allow-listed in eslint.config.js.',
        },
      ],
    },
  },
  // Rules for Node.js / config files
  {
    files: [
      '**/*.config.js',
      '**/*.config.mjs',
      '**/babel.config.js',
      '**/index.js',
      'eslint.config.js',
      '**/jest.setup.js',
      '**/*.cjs',
      // Expo config plugins run in Node at prebuild time, not in the app bundle.
      'apps/mobile/plugins/**/*.js',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'no-undef': 'off',
    },
  },
  // Node ESM scripts (data pipelines, release guardrails)
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  // Plain-JS jest suites (the config-plugin and release-invariant tests). The
  // TypeScript suites get their globals from typescript-eslint's recommended
  // config, which disables no-undef; these need them declared explicitly.
  {
    files: ['**/*.test.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'no-undef': 'off',
    },
  }
);
