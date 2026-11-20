# Waister

A browser extension (Manifest V3) written in TypeScript.

## Requirements

- Node.js 20+ and npm

## Getting started

```sh
npm install
npm run dev      # build into dist/ and rebuild on change
```

Then load `dist/` into your browser as described below.

## Using the extension in the browser

The extension is made of three parts, and each one is debugged in a different place:

| Part           | Source               | Runs in                                       |
| -------------- | -------------------- | --------------------------------------------- |
| Background     | `src/background.ts`  | Its own context (service worker / event page) |
| Content script | `src/content.ts`     | Every web page you open (isolated world)      |
| Popup          | `src/popup/popup.ts` | The toolbar popup, only while it is open      |

`console.log` output from each part shows up in **that part's** DevTools, not in a shared
console. In `npm run dev` builds, inline source maps let you see and set breakpoints in the
original `.ts` files.

### Development loop

1. Keep `npm run dev` running. It rebuilds `dist/` on every save.
2. Reload the extension in the browser (see below). Changes to the background, popup and
   manifest need this.
3. Refresh any open tabs you are testing on. Already-open pages keep the old content script
   until they are reloaded.

### Chrome (also Edge, Brave and other Chromium browsers)

**Load:**

1. Open `chrome://extensions` (`edge://extensions`, `brave://extensions`).
2. Turn on _Developer mode_ (top right).
3. Click _Load unpacked_ and select the `dist/` folder.
4. Pin the extension from the puzzle-piece menu so its toolbar icon is visible.

The extension stays installed across browser restarts. **Reload** it with the ↻ icon on its
card, or run `chrome.runtime.reload()` in the background console.

**Debug:**

- **Background:** on the extension card, click the _service worker_ link next to
  _Inspect views_. Chrome stops the service worker after about 30 s of inactivity, so the
  link may say _(inactive)_. Clicking it wakes the worker up, and it stays running while
  DevTools is open.
- **Content script:** open DevTools on the web page (F12). In the _Console_, switch the
  context dropdown from `top` to _Waister_ to evaluate code in the content script's world.
  The script's sources are under _Sources → Content scripts_.
- **Popup:** right-click the toolbar icon → _Inspect popup_. The popup stays open while its
  DevTools window is attached.
- **Errors:** an _Errors_ button appears on the extension card when something throws. It
  collects errors from all parts of the extension.
- **Storage:** in the background console, run `chrome.storage.local.get(null).then(console.log)`.

### Firefox

**Load:**

1. Open `about:debugging#/runtime/this-firefox`.
2. Click _Load Temporary Add-on…_ and select `dist/manifest.json`.

Temporary add-ons are removed when Firefox closes, so repeat this after every restart.
**Reload** the extension with the _Reload_ button on its entry in `about:debugging`.

**Debug:**

- **Background:** click _Inspect_ on the extension's entry in `about:debugging`. This opens a
  toolbox attached to the extension's background context.
- **Content script:** open the page's DevTools (F12). Content script logs appear in the page
  console. The sources are in the _Debugger_ under the extension's `moz-extension://` origin.
- **Popup:** in the _Inspect_ toolbox, open the ⋯ menu (top right) and enable _Disable Popup
  Auto-Hide_. Then open the popup and select `popup.html` with the iframe picker (the frame
  icon in the toolbox toolbar).
- **Errors from everything:** the Browser Console (Ctrl+Shift+J / Cmd+Shift+J) shows errors
  from all parts of the extension.

**Firefox notes:**

- Firefox does not support `background.service_worker`. For the background script to load,
  `src/manifest.json` needs `"scripts": ["background.js"]` next to `service_worker` in the
  `background` key. Chrome ignores that key (with a warning), and Firefox uses it.
- In Manifest V3, Firefox treats host permissions (including the content script's
  `<all_urls>`) as optional. If the content script doesn't run, open `about:addons` →
  _Waister_ → _Permissions_ and allow access to all websites. You can also grant access from
  the extensions (puzzle-piece) menu.

**Optional, `web-ext`:** Mozilla's CLI starts a clean Firefox profile with the extension
installed and reloads it automatically on every rebuild:

```sh
npx web-ext run --source-dir dist                      # Firefox
npx web-ext run --source-dir dist --target chromium    # Chrome/Chromium
npx web-ext lint --source-dir dist                     # validate the manifest/package
```

### Troubleshooting

- **Popup says "Content script not available on this page".** Content scripts can't run on
  browser-internal pages (`chrome://…`, `about:…`), the Chrome Web Store or
  addons.mozilla.org. They also don't run in tabs opened before the extension was
  (re)loaded. Refresh the tab.
- **Changes don't show up.** Check that `npm run dev` rebuilt without errors. Then reload
  the extension **and** refresh the page.
- **`Could not establish connection. Receiving end does not exist.`** No content script is
  listening in that tab. The causes are the same as for the popup message above.
- **Logs are missing.** You are probably looking at the wrong console. See the table at the
  top of this section.

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
