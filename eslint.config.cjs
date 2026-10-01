// Classroom sim: plain browser scripts (no build step) and Node tests.
// Run from game/: npx eslint --config ../eslint.config.cjs ../js ../tests
const globals = require('./game/node_modules/globals');
const js = require('./game/node_modules/@eslint/js');
module.exports = [
  js.configs.recommended,
  { files: ['js/**/*.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser, module: 'readonly' } } },
  { files: ['tests/**/*.js'], languageOptions: { sourceType: 'commonjs', globals: globals.node } },
];
