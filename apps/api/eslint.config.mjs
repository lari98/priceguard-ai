// Flat config (ESLint 9+/10 no longer supports .eslintrc.*). This replaced a stale
// .eslintrc.json that had never actually been runnable under the installed eslint@10.8.1
// (`npm run lint` — with --fix, which would have masked the failure by never surfacing
// the "couldn't find config" error's exit code as a lint *finding* — was apparently never
// actually executed and checked before this point in the project's history). Equivalent
// intent to the old config: TypeScript-aware linting, Node + Jest globals, unused-vars as
// an error (with a `_`-prefix escape hatch), `any` as a warning rather than an error.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // eslint:recommended's no-unused-vars and no-undef both duplicate/conflict with the
      // TypeScript-aware equivalents above and with the compiler itself; disabled per the
      // standard typescript-eslint guidance for combining with eslint:recommended.
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
