// Lint config for the game (TypeScript) and the classroom sim (plain browser scripts in ../js).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tests/**/*.ts', 'tools/**/*.{ts,mjs}', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
);
