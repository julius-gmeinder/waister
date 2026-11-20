# Waister

A browser extension (Manifest V3) written in TypeScript.

## Requirements

- Node.js 20+ and npm

## Getting started

```sh
npm install
npm run dev      # build into dist/waister/ and rebuild on change
```

Then load `dist/waister/` into your browser as described below.

## Using the extension in the browser

The extension is made of three parts, and each one is debugged in a different place:

| Part           | Source            | Runs in                                       |
| -------------- | ----------------- | --------------------------------------------- |
| Background     | `src/background/` | Its own context (service worker / event page) |
| Content script | `src/content/`    | Every web page you open (isolated world)      |
| Popup          | `src/popup/`      | The toolbar popup, only while it is open      |

`console.log` output from each part shows up in **that part's** DevTools, not in a shared
console. In `npm run dev` builds, inline source maps let you see and set breakpoints in the
original `.ts` files.

### Development loop

1. Keep `npm run dev` running. It rebuilds `dist/waister/` on every save.
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

1. Open `about:debugging#/runtime/this-firefox`.
2. Click _Load Temporary Add-on…_ and select `dist/waister/manifest.json`.

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
  `background` key (keep `"type": "module"`, the background is an ES module). Chrome ignores that key (with a warning), and Firefox uses it.
- In Manifest V3, Firefox treats host permissions (including the content script's
  `<all_urls>`) as optional. If the content script doesn't run, open `about:addons` →
  _Waister_ → _Permissions_ and allow access to all websites. You can also grant access from
  the extensions (puzzle-piece) menu.

**Optional, `web-ext`:** Mozilla's CLI starts a clean Firefox profile with the extension
installed and reloads it automatically on every rebuild:

```sh
npx web-ext run --source-dir dist/waister                      # Firefox
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

## Database (SQLite)

The background worker uses [SQLite WASM](https://sqlite.org/wasm) (`@sqlite.org/sqlite-wasm`)
through `src/background/db.ts`:

```ts
import { getDb, persist } from './db';

const db = await getDb(); // initialises SQLite on first use
db.exec('INSERT INTO kv (key, value) VALUES (?, ?)', { bind: ['a', 'b'] });
const value = db.selectValue('SELECT value FROM kv WHERE key = ?', ['a']);
await persist(); // save, see below
```

- **Schema:** edit `SCHEMA` in `src/background/db.ts`. It runs on every start, so keep the statements
  idempotent (`CREATE TABLE IF NOT EXISTS …`).
- **Persistence:** the database lives in memory, and `persist()` saves a snapshot of the
  whole database to IndexedDB, which `getDb()` restores on the next start. Call it after every
  write you want to keep. The browser stops the background worker when it's idle, and anything
  not persisted is lost. (The OPFS-backed SQLite VFSes need a dedicated Worker, which MV3
  service workers can't create.)
- **Try it:** from the popup's DevTools console:
  `await chrome.runtime.sendMessage({ type: 'KV_SET', key: 'hello', value: 'world' })`, then
  `await chrome.runtime.sendMessage({ type: 'KV_GET', key: 'hello' })`.
- **Build details:** `sqlite3.wasm` is copied next to `background.js`, which is bundled as an ES
  module so that SQLite can find the `.wasm` file via `import.meta.url`. The manifest's CSP allows
  `'wasm-unsafe-eval'`, which is needed to compile WebAssembly.
- **Only the background** can use the database. The popup and content scripts talk to it through
  messages (see `src/shared/messages.ts` and `src/background/handlers.ts`).

## Scripts

| Command             | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Watch mode with inline source maps                   |
| `npm run build`     | Production build (minified) into `dist/waister/`     |
| `npm run typecheck` | Type-check with `tsc`                                |
| `npm run lint`      | Lint with ESLint                                     |
| `npm run format`    | Format with Prettier                                 |
| `npm run check`     | Typecheck + lint + format check                      |
| `npm run zip`       | Build and package it as `dist/waister-<version>.zip` |

## Project structure

```
src/
  manifest.json             Extension manifest (copied to dist/waister/)

  shared/                   Used by more than one context
    messages.ts               Message types
    types.ts                  Data contracts (page data, estimates)

  content/                  READ: runs on the chat sites
    index.ts                  Entry: wires a site adapter to a reader
    sites/                    Layer 1, WHERE: one adapter per chat site
    readers/                  Layer 2, WHEN/HOW: swappable read strategies

  background/               PARSE + ESTIMATE + STORE
    index.ts                  Entry: registers listeners
    handlers.ts               Routes messages
    parsing.ts                Clean page data, resolve the model
    estimation.ts             Tokens → water + energy (via lookup table)
    db.ts                     SQLite (WASM), background-only

  popup/                    PRESENT ("Tacho" UI)
    index.html index.ts index.css

public/                     Static assets copied verbatim into dist/waister/ (e.g. icons/)
scripts/
  build.mjs                 esbuild build script
  zip.mjs                   Packages dist/waister/ for store upload
```

### Data flow

```
chat page DOM
  └─ content:    sites/<site> (where) ← readers/<strategy> (when) → page data
                    │ runtime message
  └─ background: parsing → estimation (db lookup) → db
                    │ runtime message
  └─ popup:      UI
```

- **Swapping how pages are read:** readers only call the adapter's DOM reads. A different
  strategy is a new file in `content/readers/` plus a one-line change in `content/index.ts`. A
  site redesign only touches that site's adapter.
- **Content scripts stay thin:** they only send plain text and timestamps. Tokenizers and the
  SQLite lookup are heavy and live in the background, where they're loaded once and not into
  every tab.
- **Another option for later, network hooking:** instead of reading the DOM, a content script
  running in the page's `MAIN` world can wrap `fetch` and read the streamed API responses.
  That's more exact (model and full output), but it breaks more easily and needs a bridge
  (`window.postMessage`) back to the normal content script. It would plug in as another reader.

There's one folder per runtime context, and each has an `index.ts` entry point. Put code that
only one context uses inside that context's folder (`background/db.ts`, say). Only code that
several contexts need goes into `shared/`. ESLint enforces this: the popup and the content
script can't import from `background/`, and `shared/` can't import from any context.

To add a new context (an options page, side panel, offscreen document, …), create
`src/<name>/` with an `index.ts` (and an `index.html` for pages). Then add the entry point and
any static files to `scripts/build.mjs`, and register them in `src/manifest.json`.

esbuild bundles each entry point into a single self-contained file, so `shared/` code can be
imported anywhere, including from content scripts.

## Adding icons

Put PNGs in `public/icons/` (e.g. 16, 32, 48, 128 px) and reference them in
`src/manifest.json`:

```json
"icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
```
