# Waister

A browser extension (Manifest V3) written in TypeScript.

## Requirements

- Node.js 20+ and npm

## Getting started

```sh
npm install
npm run dev      # build into dist/ and rebuild on change
```

Then load the extension:

- **Chrome / Edge / Brave:** open `chrome://extensions`, enable _Developer mode_, click
  _Load unpacked_ and select the `dist/` folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click _Load Temporary Add-on_
  and select `dist/manifest.json`.

After a rebuild, click the reload icon on the extension card (and refresh open tabs to reload
content scripts).

## Scripts

| Command             | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Watch mode with inline source maps                   |
| `npm run build`     | Production build (minified) into `dist/`             |
| `npm run typecheck` | Type-check with `tsc`                                |
| `npm run lint`      | Lint with ESLint                                     |
| `npm run format`    | Format with Prettier                                 |
| `npm run check`     | Typecheck + lint + format check                      |
| `npm run zip`       | Build and package `dist/` as `waister-<version>.zip` |

## Project structure

```
src/
  manifest.json     Extension manifest (copied to dist/)
  background.ts     Background service worker
  content.ts        Content script injected into web pages
  messages.ts       Shared message types
  popup/            Toolbar popup (HTML, CSS, TS)
public/             Static assets copied verbatim into dist/ (e.g. icons/)
scripts/
  build.mjs         esbuild build script
  zip.mjs           Packages dist/ for store upload
```

Each TypeScript entry point is bundled by esbuild into a single self-contained file (IIFE),
so shared code in `src/` can be imported freely, including from content scripts.

## Adding icons

Put PNGs in `public/icons/` (e.g. 16, 32, 48, 128 px) and reference them in
`src/manifest.json`:

```json
"icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
```
