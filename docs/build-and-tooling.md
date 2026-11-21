# Build and tooling

Documents the existing (pre-`src`) code and configs. Requirements: Node.js 20+, npm.

## npm scripts (`package.json`)

| Script                                                  | Runs                                     |
| ------------------------------------------------------- | ---------------------------------------- |
| `npm run dev`                                           | `scripts/build.mjs --watch`              |
| `npm run build`                                         | `scripts/build.mjs` (minified)           |
| `npm run typecheck`                                     | `tsc --noEmit`                           |
| `npm run lint`                                          | `eslint .`                               |
| `npm run format`                                        | `prettier --write .`                     |
| `npm run check`                                         | typecheck + lint + format check          |
| `npm run zip`                                           | build, then `scripts/zip.mjs`            |
| `npm run dev:firefox` / `build:firefox` / `zip:firefox` | same with `--firefox` (Firefox manifest) |

## `scripts/build.mjs`

esbuild build into `dist/waister/` (the unpacked extension you load in the browser).

- Wipes and recreates `dist/waister/` on every start.
- **Two builds:**
  - **background**: `format: 'esm'`. The manifest declares the background as
    `"type": "module"`. It is ESM so that sqlite-wasm can find `sqlite3.wasm` through
    `import.meta.url` (the prompt store, see [ADR 0009](decisions/0009-sqlite-prompt-store.md)).
  - **content + popup**: `format: 'iife'`. Content scripts can't use ES module imports, so
    every entry is a single self-contained file.
- `bundle: true`, `target: 'es2022'`. With `--watch`: inline source maps, no minify. Without it:
  minified, no source maps.
- `define: process.env.NODE_ENV` is `'development'` with `--watch` and `'production'` without it,
  so the production popup bundles React without its dev checks
  ([ADR 0010](decisions/0010-react-popup.md)).
- **Static files** are copied after each successful build by the `copy-static` plugin
  (`[source, destination]`, skipped if the source doesn't exist):
  `src/ui/popup/popup.html` → `popup/index.html`, `src/ui/app/app.html` → `app/index.html`,
  everything in `public/`, and `node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm` →
  `sqlite3.wasm` (next to `background.js`).
- Entries: `src/entries/background.entry.ts` → `background.js`,
  `src/entries/content.entry.ts` → `content.js`, `src/entries/popup.entry.tsx` →
  `popup/index.js`, `src/entries/app.entry.tsx` → `app/index.js` (both React apps, compiled from
  TSX by esbuild with no plugin). Each IIFE bundle contains its own copy of React.
- **UI CSS is bundled, not copied:** each UI entry imports `src/ui/base.css`,
  `src/ui/components/components.css` and its own layout CSS. esbuild emits `popup/index.css` /
  `app/index.css` next to the JS. `base.css` `@import`s the Fontsource CSS from `node_modules`. In
  watch mode a CSS change triggers a rebuild. Font files go through the `file` loader
  (`.woff2`, `.woff`) and land once in `fonts/` at the extension root
  (`assetNames: 'fonts/[name]'`), shared by both pages. See [styling.md](styling.md#css-files).
- Watch mode keeps one esbuild context per build alive.
- **Manifest per browser:** after each build, `writeManifest()` writes
  `dist/waister/manifest.json` from `src/manifest.json`. By default (Chrome) it is copied
  unchanged. With `--firefox`, `background.service_worker` is replaced by
  `background.scripts: ["background.js"]`.

## Manifest (`src/manifest.json`)

MV3, recreated after commit `4c0bb6a` deleted it.

- **Popup:** `action.default_popup` = `popup/index.html`.
- **Background:** `background.js` as ES module (`"type": "module"`). The source declares only
  `service_worker` (Chrome warns about `scripts` in MV3). The `--firefox` build swaps it for
  `scripts`, because Firefox has no background service workers (see root README).
- **Content script:** `content.js` at `document_idle`, only on `https://chatgpt.com/*`,
  `https://claude.ai/*`, `https://gemini.google.com/*`.
- **Permissions:** only `unlimitedStorage`, so the SQLite snapshot in IndexedDB is not evicted
  under storage pressure (no install warning). `storage` and `tabs` were dropped with the
  estimate cache: the conversation URL comes from the content script, not from `chrome.tabs`.
- **Icons:** `icons` (16, 32, 48, 128) and `action.default_icon` (16, 32) from `public/icons/`.
- **CSP:** `extension_pages` = `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`.
  `'wasm-unsafe-eval'` lets the background compile `sqlite3.wasm`.

## `scripts/zip.mjs`

Packages `dist/waister/` into `dist/<name>-<version>-<browser>.zip` (name and version from
`package.json`, browser `chrome` or `firefox` read from the built manifest) for store upload. On Windows it uses PowerShell `Compress-Archive`, elsewhere
the `zip` CLI. Deletes an old zip of the same name first.

## TypeScript (`tsconfig.json`)

Type-check only (`noEmit`; esbuild compiles). `target ES2022`, `module ESNext`,
`moduleResolution Bundler`, libs `ES2022` + `DOM`, types `chrome`, `jsx: react-jsx` (automatic
JSX runtime, no `import React` needed; esbuild reads the same setting). Strict, plus
`noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`isolatedModules`, `verbatimModuleSyntax` (use `import type` for types).
Includes `src/`.

Stub files end in `export {};` so that they count as modules under `isolatedModules`.

## ESLint

`eslint.config.js` (flat config): `@eslint/js` recommended + `typescript-eslint` recommended +
`eslint-config-prettier` (turns off formatting rules). Browser + webextension globals for
`src/**/*.{ts,tsx}`, Node globals for `scripts/**/*.mjs` and root `*.js`. No React-specific
lint rules yet (`eslint-plugin-react-hooks` would be the next one to add).

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
| `src/entries/popup.entry.tsx`     | `readers/`, `handlers/`, `services/`        |
| `src/entries/app.entry.tsx`       | `readers/`, `handlers/`, `services/`        |

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

SQLite came back in [ADR 0009](decisions/0009-sqlite-prompt-store.md) with the same in-memory +
IndexedDB snapshot approach as `a3805a8`, now as `services/prompt-store/`.
