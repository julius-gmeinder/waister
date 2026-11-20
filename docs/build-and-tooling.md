# Build and tooling

Documents the existing (pre-`src`) code and configs. Requirements: Node.js 20+, npm.

## npm scripts (`package.json`)

| Script              | Runs                            |
| ------------------- | ------------------------------- |
| `npm run dev`       | `scripts/build.mjs --watch`     |
| `npm run build`     | `scripts/build.mjs` (minified)  |
| `npm run typecheck` | `tsc --noEmit`                  |
| `npm run lint`      | `eslint .`                      |
| `npm run format`    | `prettier --write .`            |
| `npm run check`     | typecheck + lint + format check |
| `npm run zip`       | build, then `scripts/zip.mjs`   |

## `scripts/build.mjs`

esbuild build into `dist/waister/` (the unpacked extension you load in the browser).

- Wipes and recreates `dist/waister/` on every start.
- **Two builds:**
  - **background**: `format: 'esm'`. The manifest declares the background as
    `"type": "module"`. It was ESM so that sqlite-wasm could find `sqlite3.wasm` through
    `import.meta.url`. Heavy services (tokenizers, possibly WASM) benefit from the same setup.
  - **content + popup**: `format: 'iife'`. Content scripts can't use ES module imports, so
    every entry is a single self-contained file.
- `bundle: true`, `target: 'es2022'`. With `--watch`: inline source maps, no minify. Without it:
  minified, no source maps.
- **Static files** are copied after each successful build by the `copy-static` plugin
  (`[source, destination]`, skipped if the source doesn't exist):
  `src/manifest.json`, `src/ui/popup/popup.html` → `popup/index.html`,
  `src/ui/popup/popup.css` → `popup/index.css`, and everything in `public/`.
- Entries: `src/entries/background.entry.ts` → `background.js`,
  `src/entries/content.entry.ts` → `content.js`, `src/entries/popup.entry.ts` →
  `popup/index.js`.
- Watch mode keeps one esbuild context per build alive.

## Manifest (`src/manifest.json`)

MV3, recreated after commit `4c0bb6a` deleted it.

- **Popup:** `action.default_popup` = `popup/index.html`.
- **Background:** `background.js` as ES module (`"type": "module"`). `service_worker` for
  Chrome, `scripts` for Firefox (see root README).
- **Content script:** `content.js` at `document_idle`, only on `https://chatgpt.com/*`,
  `https://claude.ai/*`, `https://gemini.google.com/*`.
- **Permissions:** `storage` (for `chrome.storage.session`) and `tabs`. The popup's
  `chrome.tabs.query` for the active tab's id works without `tabs`. That permission is only
  needed to read tab URLs/titles, and Chrome shows an install warning for it.
- **Icons:** `icons` (16, 32, 48, 128) and `action.default_icon` (16, 32) from `public/icons/`.
- No CSP. The old `'wasm-unsafe-eval'` is only needed again if a tokenizer ships as WASM.

## `scripts/zip.mjs`

Packages `dist/waister/` into `dist/<name>-<version>.zip` (name and version from
`package.json`) for store upload. On Windows it uses PowerShell `Compress-Archive`, elsewhere
the `zip` CLI. Deletes an old zip of the same name first.

## TypeScript (`tsconfig.json`)

Type-check only (`noEmit`; esbuild compiles). `target ES2022`, `module ESNext`,
`moduleResolution Bundler`, libs `ES2022` + `DOM`, types `chrome`. Strict, plus
`noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`isolatedModules`, `verbatimModuleSyntax` (use `import type` for types).
Includes `src/`.

Stub files end in `export {};` so that they count as modules under `isolatedModules`.

## ESLint

`eslint.config.js` (flat config): `@eslint/js` recommended + `typescript-eslint` recommended +
`eslint-config-prettier` (turns off formatting rules). Browser + webextension globals for
`src/**/*.ts`, Node globals for `scripts/**/*.mjs` and root `*.js`.

**Context boundaries (current config, written for the old layout):**

- `src/popup/**` and `src/content/**` must not import `background/`.
- `src/shared/**` must not import any context folder.

Those globs no longer match anything. **Planned rules for the layered layout** (not applied
yet), via `no-restricted-imports` per folder:

| Files                             | Forbidden imports                           |
| --------------------------------- | ------------------------------------------- |
| `src/readers/**`                  | `handlers/`, `services/`, `ui/`             |
| `src/ui/**`                       | `handlers/`, `services/`, `readers/`        |
| `src/handlers/**`                 | `readers/`, `ui/`                           |
| `src/services/**`                 | `handlers/`, `readers/`, `ui/`, `messages/` |
| `src/messages/**`                 | everything except `dto/`                    |
| `src/dto/**`                      | everything                                  |
| `src/entries/content.entry.ts`    | `handlers/`, `services/`, `ui/`             |
| `src/entries/background.entry.ts` | `readers/`, `ui/`                           |
| `src/entries/popup.entry.ts`      | `readers/`, `handlers/`, `services/`        |

## Formatting and editor

- **Prettier** (`.prettierrc.json`): single quotes, semicolons, trailing commas, width 100.
  Ignores `dist/`, `node_modules/`, `package-lock.json`.
- **EditorConfig**: UTF-8, LF, 2-space indent, final newline, trim trailing whitespace (not in
  `.md`).
- **`.gitattributes`**: normalize text to LF. PNG/ICO are binary.
- **VS Code** recommends the ESLint, Prettier and EditorConfig extensions.
- **`.gitignore`**: `node_modules/`, `dist/`, packaged extensions (`*.zip`, `*.crx`, `*.xpi`,
  `*.pem`), env files, editor/OS files, tool caches.

## `public/`

Copied verbatim into `dist/waister/`. `public/icons/` holds the extension icon PNGs (rendered
from `public/logo/waister.svg`), and `public/logo/` the logo SVGs. See the root README
(_Extension icon_).

## History of removed code

| Commit    | What                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| `a3805a8` | SQLite WASM: `db.ts` with an in-memory DB, persisted as a snapshot to IndexedDB; `KV_GET`/`KV_SET` messages |
| `e74c99d` | Moved files into per-context folders (`background/`, `content/`, `popup/`, `shared/`)                       |
| `8c56420` | Backbone v2: site adapters + reader strategies, `parsing.ts`, `estimation.ts` (tokens → water/energy)       |
| `4c0bb6a` | Deleted all of `src/`                                                                                       |

`@sqlite.org/sqlite-wasm` is still listed in `package.json` `dependencies` but is unused (the
`sqlite3.wasm` copy step is already gone). Remove it with `npm uninstall @sqlite.org/sqlite-wasm`.
