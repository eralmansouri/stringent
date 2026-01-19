// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

/** @type {import('typescript-eslint').ConfigArray} */
export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      // TypeScript-specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      // Allow type-level code patterns common in this codebase
      '@typescript-eslint/no-unused-expressions': 'off',
      // General rules
      'no-console': 'warn',
    },
  },
  {
    // Apply type-aware linting to src files using tsconfig.json
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Ignore patterns
    ignores: [
      'dist/**',
      'node_modules/**',
      'docs/api/**',
      'examples/**',
      '*.js',
      '*.cjs',
    ],
  },
];
