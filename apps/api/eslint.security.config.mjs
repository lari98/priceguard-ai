// Phase 9 (Production Hardening) — SAST pass. A separate config (rather than folded into
// eslint.config.mjs) so `npm run lint`'s existing --max-warnings=0 gate isn't silently
// tightened mid-project; see docs/adr/0011-production-hardening-scope.md for why
// eslint-plugin-security's findings were triaged rather than blindly enforced as errors,
// and SECURITY.md for the running list of accepted/fixed findings.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import security from 'eslint-plugin-security';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: './tsconfig.json', sourceType: 'module' },
      globals: { ...globals.node, ...globals.jest },
    },
    plugins: { '@typescript-eslint': tseslint, security },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...security.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
