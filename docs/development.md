# Development

How to build Waister, load it into Chrome or Firefox, and debug each part of it. The build
scripts themselves are covered in [build-and-tooling.md](build-and-tooling.md).

## Requirements

- Node.js 20+ and npm

## Getting started

```sh
npm install
npm run dev      # build into dist/waister/ and rebuild on change
```

Then load `dist/waister/` into your browser as described below. All npm scripts are listed in
[build-and-tooling.md](build-and-tooling.md#npm-scripts-packagejson).

## Using the extension in the browser

The extension is made of four parts, and each one is debugged in a different place (the app page
like any web page: F12 in its tab):

| Part           | Source                                                      | Runs in                                       |
| -------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Background     | `src/entries/background.entry.ts`, `handlers/`, `services/` | Its own context (service worker / event page) |
| Content script | `src/entries/content.entry.ts`, `readers/`                  | The supported chat sites (isolated world)     |
| Popup          | `src/entries/popup.entry.tsx`, `ui/popup/`                  | The toolbar popup, only while it is open      |
| App page       | `src/entries/app.entry.tsx`, `ui/app/`                      | A normal browser tab (`app/index.html#/…`)    |

`console.log` output from each part shows up in **that part's** DevTools, not in a shared
console. In `npm run dev` builds, inline source maps let you see and set breakpoints in the
original `.ts` files.

### Development loop

1. Keep `npm run dev` running (Firefox: `npm run dev:firefox`). It rebuilds `dist/waister/` on
   every save.
2. Reload the extension in the browser (see below). Changes to the background, popup and
   manifest need this.
3. Refresh any open tabs you are testing on. Already-open pages keep the old content script
   until they are reloaded.

### Chrome (also Edge, Brave and other Chromium browsers)

**Load:**

1. Open `chrome://extensions` (`edge://extensions`, `brave://extensions`).
2. Turn on _Developer mode_ (top right).
3. Click _Load unpacked_ and select the `dist/waister/` folder.
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

1. Build with `npm run dev:firefox` (or `npm run build:firefox`). The default build writes a
   Chrome manifest that Firefox can't load the background from.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click _Load Temporary Add-on…_ and select `dist/waister/manifest.json`.

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

- Firefox does not support `background.service_worker`, and Chrome MV3 rejects
  `background.scripts` with a warning. So `src/manifest.json` is the Chrome manifest, and the
  `--firefox` build (`dev:firefox`, `build:firefox`, `zip:firefox`) replaces `service_worker`
  with `"scripts": ["background.js"]` in `dist/waister/manifest.json`. With
  `"type": "module"` the background is an ES module in both browsers.
- In Manifest V3, Firefox treats host permissions (including the content script's matches
  for chatgpt.com, claude.ai and gemini.google.com) as optional. If the content script doesn't
  run, open `about:addons` → _Waister_ → _Permissions_ and allow access to those sites. You
  can also grant access from the extensions (puzzle-piece) menu.

**Optional, `web-ext`:** Mozilla's CLI starts a clean Firefox profile with the extension
installed and reloads it automatically on every rebuild:

```sh
npx web-ext run --source-dir dist/waister                      # Firefox (after build:firefox)
npx web-ext run --source-dir dist/waister --target chromium    # Chrome/Chromium
npx web-ext lint --source-dir dist/waister                     # validate the manifest/package
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

## Inspecting the database

Every estimated prompt is saved as one row in a SQLite database (`@sqlite.org/sqlite-wasm`) in
the background ([ADR 0009](decisions/0009-sqlite-prompt-store.md)): UUID, conversation URL,
model, token breakdown, timings and impact. No chat text. The database runs in memory and a
snapshot is saved to IndexedDB after each insert. To inspect it, open the background console
(see the table above) and look under _Application → IndexedDB → waister_. Removing the extension
deletes it. `npm run dummy` fills it with fake prompts (up to ~12M tokens in total) for testing
the UI.
