import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

/**
 * Import boundaries per layer. Keep in sync with the import table in docs/architecture.md.
 * Each context is a separate JS world, and esbuild bundles every entry on its own, so a wrong
 * import doesn't fail the build. It silently copies code into the wrong bundle.
 */
function forbidLayers(files, layers, message) {
  return {
    files,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: layers.flatMap((layer) => [`**/${layer}`, `**/${layer}/**`]), message },
          ],
        },
      ],
    },
  };
}

const BACKGROUND_ONLY = 'Background code only runs in the background. Send a message instead.';
const NOT_IN_PAGES = 'Pages only reach the background through runtime messages.';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  forbidLayers(
    ['src/readers/**'],
    ['handlers', 'services', 'ui'],
    `Content code must not import background or UI code. ${BACKGROUND_ONLY}`,
  ),
  forbidLayers(['src/ui/**'], ['handlers', 'services', 'readers'], NOT_IN_PAGES),
  forbidLayers(
    ['src/handlers/**'],
    ['readers', 'ui'],
    'Handlers (background) must not import content or UI code.',
  ),
  forbidLayers(
    ['src/services/**'],
    ['handlers', 'readers', 'ui', 'messages'],
    'Services only compute. They must not know handlers, messages, content or UI code.',
  ),
  forbidLayers(
    ['src/messages/**'],
    ['entries', 'readers', 'handlers', 'services', 'ui', 'config'],
    'Message contracts may only import dto/.',
  ),
  forbidLayers(
    ['src/config/**'],
    ['entries', 'readers', 'handlers', 'services', 'ui', 'messages'],
    'config/ may only import dto/ (types only).',
  ),
  forbidLayers(
    ['src/dto/**'],
    ['entries', 'readers', 'handlers', 'services', 'ui', 'messages', 'config'],
    'DTOs are plain data and import no other layer.',
  ),
  forbidLayers(
    ['src/entries/content.entry.ts'],
    ['handlers', 'services', 'ui'],
    'The content entry wires readers/ and messages/ only.',
  ),
  forbidLayers(['src/entries/background.entry.ts'], ['readers', 'ui'], BACKGROUND_ONLY),
  forbidLayers(
    ['src/entries/popup.entry.tsx', 'src/entries/app.entry.tsx'],
    ['readers', 'handlers', 'services'],
    NOT_IN_PAGES,
  ),
  {
    files: ['scripts/**/*.mjs', '*.js'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
