// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import mocha from 'eslint-plugin-mocha';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'dist/',
    'dist-server/',
    'coverage/',
    'android/',
    'ios/',
    'assets/',
    'public/',
    'firefox/',
    '.nyc_output/'
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser }
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // ids and paths are validated where they come from
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false }
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  {
    // build tooling stays plain CommonJS
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off'
    }
  },
  {
    files: ['types/**/*.d.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' }
  },
  {
    files: ['test/**/*.ts'],
    ...mocha.configs.recommended,
    rules: {
      ...mocha.configs.recommended.rules,
      'mocha/no-mocha-arrows': 'off',
      'mocha/no-setup-in-describe': 'off',
      'mocha/max-top-level-suites': 'off',
      'mocha/consistent-spacing-between-blocks': 'off'
    }
  },
  prettier
]);
