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
  `src/manifest.json`, the popup HTML/CSS, `sqlite3.wasm`, and everything in `public/`.
- Watch mode keeps one esbuild context per build alive.

### Required changes for the new layout (not done yet)

`build.mjs` still points at the old per-context paths, which no longer exist since commit
`4c0bb6a` ("reset src"). The build fails until these are updated:

| Setting             | Old                       | New                                            |
| ------------------- | ------------------------- | ---------------------------------------------- |
| background entry    | `src/background/index.ts` | `src/entries/background.entry.ts`              |
| content entry       | `src/content/index.ts`    | `src/entries/content.entry.ts`                 |
| popup entry         | `src/popup/index.ts`      | `src/entries/popup.entry.ts`                   |
| popup HTML          | `src/popup/index.html`    | `src/ui/popup/popup.html` → `popup/index.html` |
| popup CSS           | `src/popup/index.css`     | `src/ui/popup/popup.css` → `popup/index.css`   |
| `sqlite3.wasm` copy | present                   | remove (SQLite is out of scope)                |
| `src/manifest.json` | deleted in `4c0bb6a`      | recreate (see below)                           |

### Manifest (to recreate)

The last version (commit `8c56420`) had: MV3, popup `popup/index.html`, background
`background.js` as module, content script `content.js` on `<all_urls>` at `document_idle`,
permission `storage`, and CSP `script-src 'self' 'wasm-unsafe-eval'`. For the new scope:

- Narrow `content_scripts.matches` to `https://chatgpt.com/*`, `https://claude.ai/*`,
  `https://gemini.google.com/*`.
- Keep `storage` (for `chrome.storage.session`).
- Keep `'wasm-unsafe-eval'` only if a tokenizer ships as WASM.
- For Firefox, add `"scripts": ["background.js"]` next to `service_worker` (see root README).

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

Copied verbatim into `dist/waister/`. `public/icons/` is empty (`.gitkeep`). See the root README
for adding icons.

## History of removed code

| Commit    | What                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| `a3805a8` | SQLite WASM: `db.ts` with an in-memory DB, persisted as a snapshot to IndexedDB; `KV_GET`/`KV_SET` messages |
| `e74c99d` | Moved files into per-context folders (`background/`, `content/`, `popup/`, `shared/`)                       |
| `8c56420` | Backbone v2: site adapters + reader strategies, `parsing.ts`, `estimation.ts` (tokens → water/energy)       |
| `4c0bb6a` | Deleted all of `src/`                                                                                       |

`@sqlite.org/sqlite-wasm` is still listed in `package.json` `dependencies` but is unused. Remove
it together with the `sqlite3.wasm` copy step when the build is updated.
