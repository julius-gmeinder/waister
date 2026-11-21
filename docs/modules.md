# Modules

Reference for every folder and file in `src/`. The code is organized **by layer**, and each layer
runs in exactly one runtime context or is shared. Import rules are in
[architecture.md](architecture.md#layers--contexts).

Status: the pipeline is implemented end to end. The tokenizers are character-based
approximations, and the readers depend on each site's current DOM.

| Folder                   | Layer                                  | Runs in              |
| ------------------------ | -------------------------------------- | -------------------- |
| [`entries/`](#entries)   | Entry points (one per context)         | each its own context |
| [`readers/`](#readers)   | Reads the chat page → `ChatCaptureDto` | content script       |
| [`handlers/`](#handlers) | Orchestration (messages, estimation)   | background           |
| [`services/`](#services) | Tokenizing, estimating, storing        | background           |
| [`ui/`](#ui)             | React popup + full-page app            | popup, app page      |
| [`dto/`](#dtos)          | Data contracts between layers          | shared               |
| [`messages/`](#messages) | `chrome.runtime` message contracts     | shared               |
| [`config/`](#config)     | All tunable values (`config.json`)     | shared               |

---

## Entries

`src/entries/`: one file per runtime context. These are the esbuild entry points and contain
**wiring only**: no logic, just "pick the parts, connect them, register listeners".

| File                  | Bundle                  | Context    | Wires up                                        |
| --------------------- | ----------------------- | ---------- | ----------------------------------------------- |
| `content.entry.ts`    | `content.js` (IIFE)     | content    | site adapter + reader strategy → chat reader    |
| `background.entry.ts` | `background.js` (ESM)   | background | `chrome.runtime.onMessage` → message handler    |
| `popup.entry.tsx`     | `popup/index.js` (IIFE) | popup      | imports popup CSS + fonts, mounts `<PopupApp/>` |
| `app.entry.tsx`       | `app/index.js` (IIFE)   | app page   | imports app CSS + fonts, mounts `<App/>`        |

`css-imports.d.ts` is type-only: it declares `*.css` modules so that `tsc` accepts the CSS
imports in the `.entry.tsx` files (TypeScript 6 checks side-effect imports).

Why ESM for the background and IIFE for the others: see
[build-and-tooling.md](build-and-tooling.md#scriptsbuildmjs). `scripts/build.mjs` still points at
the old `src/<context>/index.ts` paths, so it has to be updated before the first build.

---

## Readers

`src/readers/` (content script): reads a finished prompt/response pair from the chat site's DOM
and produces one [`ChatCaptureDto`](dto.md#chatcapturedto). Nothing here tokenizes or estimates.
The content script stays thin and only sends plain text plus timing.

```
sites/<site>.site.ts                 WHERE: DOM selectors, reads and state checks for one site
strategies/dom-capture.strategy.ts   WHEN: one turn-detection loop for all sites, calculates latencyMs & thinkingTimeMs, builds ChatCaptureDto
chat.reader.ts                       Re-exports the consolidated strategy facade
```

- **A site redesign** only touches that site's adapter (`CHATGPT_SELECTORS`, `CLAUDE_SELECTORS`, `GEMINI_SELECTORS`).
- **A new chat site** is a new `*.site.ts` that implements `SiteAdapter`, added to `SUPPORTED_SITES` in `dom-capture.strategy.ts`.

May import: `dto/`, `messages/`, `config/` (section `capture`). Must not import: `handlers/`,
`services/`, `ui/`.

### Site adapters

`src/readers/sites/` (WHERE): one adapter per supported chat web app. A site adapter only **knows
the site's DOM**: selectors, plain reads and state checks. It holds no timing logic. When a prompt
was sent and when its response finished is decided by the strategy
([ADR 0008](decisions/0008-turn-detection-in-strategy.md)).

| File              | Site    | Host                | Provider    |
| ----------------- | ------- | ------------------- | ----------- |
| `chatgpt.site.ts` | ChatGPT | `chatgpt.com`       | `openai`    |
| `claude.site.ts`  | Claude  | `claude.ai`         | `anthropic` |
| `gemini.site.ts`  | Gemini  | `gemini.google.com` | `google`    |

`effort-inference.ts` is internal to `sites/`: it reads `capture.effortInference` from
[`config.json`](#config) and validates the strings. `THINKING_DETECTED_EFFORT` is used when the UI
shows that thinking is on without a level. `familyDefaultEffort(family)` is used when there is no
thinking signal (e.g. `claude-haiku` → `none`, `gemini-flash` → `low`, otherwise `unknown`). The
model names a parser produces are typed `ModelFamily<provider>` (plus a generic fallback like
`'claude'`), so they can't drift from the rate table.

Contract (`site-adapter.types.ts`):

| Member                     | Returns                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `provider`                 | `Provider`                                                                           |
| `matches(host)`            | whether this adapter handles the page                                                |
| `readModel()`              | `ModelInfo` (name, version, thinking effort; `unknown` if not visible)               |
| `readUserInput()`          | text of the latest user message                                                      |
| `readResponse()`           | text of the latest assistant message                                                 |
| `readHistory()`            | `ChatTurn[]` of all earlier turns                                                    |
| `countUserMessages()`      | number of user messages in the DOM (a newly sent prompt raises it)                   |
| `countResponses()`         | number of assistant responses in the DOM (a new response raises it)                  |
| `isGenerating()`           | whether a response is currently streaming                                            |
| `isStreamingVisibleText()` | whether visible output tokens have begun rendering in the latest assistant container |
| `isPromptInput(target)`    | whether an element is (inside) the prompt composer                                   |
| `isSendButton(target)`     | whether an element is (inside) the send button                                       |

#### Selectors per site

1. **ChatGPT (`chatgpt.site.ts` — `chatgpt.com`)**: ChatGPT serves two DOMs and every selector covers both: the classic app and the "web-mobile" shell (`#web-mobile-root`, seen when logged out).
   - **Turns**: role nodes are `[data-message-author-role]` (classic) or `li[data-message-role]` (web-mobile). One answer can span several assistant role nodes (reasoning, tool calls, final answer), so consecutive role nodes of the same author are merged into one turn. Role nodes nested in another role node are skipped. Counts, response, user input and history all work on these turns. History = all turns before the latest user turn.
   - **Composer / send button**: `#prompt-textarea` (classic) or `textarea#mobile-composer-prompt` (web-mobile), and `button[data-testid="send-button"]` / `#composer-submit-button` (never while it is the stop button). The web-mobile send button is not matched yet, so a click-send there is picked up by the strategy's page fallback (new user message appears).
   - **Active generation / streaming**: `button[data-testid="stop-button"]` anywhere, `.result-streaming` inside the latest assistant turn, or (web-mobile) a latest assistant message without `data-message-complete`. Page-wide class or aria-label matches are avoided on purpose: a leftover match keeps the strategy in "generating" forever.
   - **Visible text**: the latest assistant turn has text in a `.markdown` / `[data-assistant-markdown-root]` block (the "Thinking…" placeholder doesn't count). User text prefers `[data-user-message-bubble]`. Both fall back to the raw role node text.
   - **Model**: `data-message-model-slug` of the latest answer (the model that actually answered, e.g. `gpt-5-1-thinking`, `o4-mini-high`), with the effort refined from the picker label. Fallback: the label of `[data-testid="model-switcher-dropdown-button"]`, else `unknown` (e.g. logged out).

2. **Claude (`claude.site.ts` — `claude.ai`)**:
   - **Composer / send button**: `div.ProseMirror[contenteditable="true"]` and `button[aria-label="Send Message"]`.
   - **Active generation / streaming**: Checks for `[data-is-streaming="true"]` or `button[aria-label="Stop Response"]`.
   - **Visible text**: the latest `.font-claude-message` / `.font-claude-response` container has text.
   - **Turns & model**: Reads user turns from `[data-testid="user-message"]`, assistant turns from `.font-claude-message` / `.font-claude-response`, and model info from `[data-testid="model-selector-dropdown"]` plus `[data-testid*="thinking"]`.

3. **Gemini (`gemini.site.ts` — `gemini.google.com`)**:
   - **Composer / send button**: `rich-textarea .ql-editor` and `button.send-button:not(.stop)` / `button[aria-label="Send message"]`.
   - **Active generation / streaming**: Checks for `button.send-button.stop` or a `stop` icon in the send button (locale-independent), `button[aria-label="Stop response"]` (English UI only), `model-response[is-streaming="true"]`, or a spinner inside `<model-response>`.
   - **Visible text**: the latest `<model-response>` has text inside `<message-content>` / `.model-response-text` (excluding `<model-thoughts>` drawers).
   - **Turns & model**: Reads `<user-query>` and `<model-response>` custom elements in document order, and reads the model label from `[data-test-id="bard-mode-menu-button"]` / `.input-area-switch-label`.

### Reader strategies

`src/readers/strategies/` (CONSOLIDATION & WHEN): one turn-detection loop on top of the site
adapters. It builds the DTO only once the response has completely finished (`t1`). Timing details:
[pipeline.md](pipeline.md#1-reader--consolidated-strategy-content-script).

| File                      | Strategy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dom-capture.strategy.ts` | Default consolidated strategy. Resolves the active `SiteAdapter`, detects `{ t0, tStreamStart, t1 }` with `observeTurns`, computes `latencyMs` and `thinkingTimeMs`, reads `conversationUrl` (`location.origin + location.pathname` at `t1`), builds `ChatCaptureDto`, and sends it via `ESTIMATE_PROMPT` to `handleEstimation` in `estimation.handler.ts`. Logs `[waister]` lines to the page console: the send, each change of the detected state while a prompt is in flight (`generating`, user/response counts vs. baseline, response length), the capture, and why a prompt was dropped. |

Contract (`reader-strategy.types.ts`): `start(onCapture?, host?, customAdapters?)`, plus the
`TurnTimings` type `{ t0, tStreamStart, t1 }`.

The detection timings (settle, text-stable, check delay, poll, stale prompt) come from
`config.json` → `capture.timings`.

---

## Handlers

`src/handlers/` (background): orchestration only. Handlers receive input, call services in the
right order and return a result. They hold no domain logic of their own (no tokenizing, no
estimation formulas).

| File                    | Role                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message.handler.ts`    | Routes each `chrome.runtime` message by `type` to the matching handler: `ESTIMATE_PROMPT` → EstimationHandler, `GET_USAGE_SUMMARY` → UsageHandler.                                                                                                                                                                   |
| `estimation.handler.ts` | **EstimationHandler**: `ChatCaptureDto` → `PromptRecordDto`. Gets visible counts from the TokenizerService and hidden counts from the EstimationService, has the EstimationService build the `TokenEstimateDto` (`totalTokens`), then has the PromptStoreService add a UUID + the conversation URL and save the row. |
| `usage.handler.ts`      | **UsageHandler**: `handleGetUsageSummary(sinceMs)` → `UsageSummaryDto`, read straight from the PromptStoreService. No link to the estimation pipeline.                                                                                                                                                               |

Style: plain exported functions (no classes). Services are imported directly. Pipeline details:
[pipeline.md](pipeline.md).

May import: `services/`, `dto/`, `messages/`. Must not import: `readers/`, `ui/`.

---

## Services

`src/services/` (background): domain logic, one folder per service. Each service is a module of
plain exported functions with a `*.service.ts` facade. Other files in the same folder are
internal to that service.

| Folder          | Service                                     | Job                                                          |
| --------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `tokenizer/`    | [TokenizerService](#tokenizer-service)      | Counts the tokens of all **visible** text in the DTO         |
| `estimation/`   | [EstimationService](#estimation-service)    | Estimates **hidden** tokens (thinking, system/tool overhead) |
| `prompt-store/` | [PromptStoreService](#prompt-store-service) | Saves every prompt to SQLite and answers the popup's queries |

Rules:

- Services don't call handlers. Prefer services not calling each other either. The handler
  passes results along instead.
- Services are the only place for heavy dependencies (tokenizer vocabularies, WASM). They load
  once in the background, never in every tab.
- Other layers import a service only through its `*.service.ts` facade.

May import: `dto/`, `config/` (sections `estimation`, `tokenizer`). Must not import: `handlers/`,
`readers/`, `ui/`, `messages/`.

### Tokenizer service

`src/services/tokenizer/`: counts the **visible** tokens for `userInput`, `response` and each
`chatHistory[]` turn. All parameters, including the per-turn framing tokens, come from
[`config.json`](#config) → `tokenizer.<provider>`. Hidden tokens are not counted here (see
[EstimationService](#estimation-service)).

| File                     | Provider    | Role / Difference across sites                                                                                                                      |
| ------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokenizer.service.ts`   | (router)    | `countVisibleTokens(capture)` → `{ input, history, output, approximate }`, built from `countInputTokens`, `countHistoryTokens`, `countOutputTokens` |
| `heuristic.tokenizer.ts` | (shared)    | `createHeuristicTokenizer(params)`: the one character-based algorithm (letter runs, digit chunks, symbol runs), parameterized per provider          |
| `openai.tokenizer.ts`    | `openai`    | Calibrated for OpenAI's `o200k_base` BPE (~4.0 chars/token, 1–3 digit number chunks) + 4 ChatML turn-framing tokens                                 |
| `anthropic.tokenizer.ts` | `anthropic` | Calibrated for Claude's BPE (~3.7 chars/token, denser subword splits) + 5 turn-framing tokens                                                       |
| `google.tokenizer.ts`    | `google`    | Calibrated for Gemini's 256k SentencePiece unigram vocabulary (~4.1 chars/token) + 4 turn-delimiter tokens                                          |

The provider files only pass their config section to `createHeuristicTokenizer`. A real tokenizer
can replace one of them without touching the others ([ADR 0006](decisions/0006-per-provider-tokenizers.md)).

### Estimation service

`src/services/estimation/`: estimates the **hidden** tokens and builds the final `TokenEstimateDto`.

All rates and constants come from [`config.json`](#config) → `estimation`.

- `thinking` = `max(0, thinkingTimeMs − baselineMs) × tokensPerMsThinking × effortMultiplier[thinkingEffort]`
  (`baselineMs` = 250)
  (**hidden output**: internal reasoning / chain-of-thought tokens generated by the model before the visible answer starts streaming; scales dynamically with `thinkingTimeMs`).
- `overhead` = `systemPromptTokens` of the model
  (**hidden input**: the provider's invisible system prompt, safety/formatting instructions, and built-in tool definitions like web search, code execution, or canvas/artifacts sent with every turn; fixed per model profile).
- See [pipeline.md — Thinking vs. Overhead](pipeline.md#thinking-vs-overhead) for a full comparison.
- `totalTokens` = input + history + output + thinking + overhead. The handler passes the visible
  counts in, so the services don't call each other.

It also computes an environmental `impact` (`energyWh`, `waterMl`, `co2Grams`) from the same
per-model entry. That value stays in the background and is **not shown** in the popup.

| File                    | Role                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `estimation.service.ts` | `estimateHiddenTokens(capture)`, `estimateThinkingTokens(...)`, `buildTokenEstimateDto(capture, visible, hidden)`, `calculateEnvironmentalImpact(...)` |
| `model-profiles.ts`     | Internal. `ESTIMATION_CONFIG` (the typed `estimation` section) and `resolveModelProfile(provider, model)` → family rates or provider default           |

### Prompt store service

`src/services/prompt-store/`: the database. Every estimated prompt becomes one row in the SQLite
`prompts` table, and the popup's queries are answered from it
([ADR 0009](decisions/0009-sqlite-prompt-store.md)). **Metrics only, no chat text.**

| File                      | Role                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt-store.service.ts` | Schema + SQL. `createPromptRecord(capture, estimate)` (adds `crypto.randomUUID()` and `conversationUrl`), `savePromptRecord(record)`, `getUsageSummary(sinceMs)` |
| `sqlite-database.ts`      | Internal. Inits `@sqlite.org/sqlite-wasm` once, restores/saves the IndexedDB snapshot, `getDatabase(schema)`, `writeAndPersist(schema, write)`                   |

- **Persistence:** MV3 service workers can't use the OPFS VFSes, so the database runs in memory.
  After every insert the whole database is exported and written to IndexedDB (`waister` →
  store `sqlite`, key `main`). The next start of the worker restores it. Writes are queued, so
  snapshots land in the same order as the inserts.
- **Table `prompts`:** `id` (UUID, PK), `conversation_url`, `captured_at` (indexed), `provider`,
  `model_name`, `model_version`, `thinking_effort`, `model_raw_label`, `input_tokens`,
  `history_tokens`, `output_tokens`, `thinking_tokens`, `overhead_tokens`, `total_tokens`,
  `latency_ms`, `thinking_time_ms`, `approximate` (0/1), `energy_wh`, `water_ml`, `co2_grams`.
- The schema runs on every start and must stay idempotent (`IF NOT EXISTS`). A column change on
  an existing table needs an `ALTER TABLE` migration.

---

## UI

`src/ui/` (popup + app page): everything the user sees, written in **React + TSX**
([ADR 0010](decisions/0010-react-popup.md)). There are two surfaces, and each is its own
esbuild entry ([ADR 0011](decisions/0011-app-page.md)):

- **Popup** (`ui/popup/`, toolbar button): the dashboard. When opened, it asks the database for
  the last 24 hours (`GET_USAGE_SUMMARY { sinceMs: now − 24 h }`) and shows the summed
  `totalTokens`, the breakdown (input, history, output, thinking, overhead) and the prompt
  count. A tab bar at the bottom opens the app page.
- **App page** (`ui/app/`, a full browser tab at `app/index.html`): a sidebar plus one page per
  route (Analytics, Facts, Tips, History). The pages are empty placeholders for now.

Neither surface talks to the estimation pipeline. The layout is deliberately plain for now.

```
base.css                              shared: fonts, color/font tokens, light/dark, element defaults
app-routes.ts                         shared: APP_ROUTES (id, label, icon), hash ↔ route, extension URLs
components/                           shared components (used by either surface)
  components.css                      styles of all components, one block each
  header.component.tsx                Header: full logo, centered (/logo/waister-full.svg)
  total.component.tsx                 Total: icon + summed token count
  breakdown.component.tsx             Breakdown: the five rows (order, labels, icons)
  breakdown-row.component.tsx         BreakdownRow: icon, label, count of one part
  tab-bar.component.tsx               TabBar (popup): one tab per route, opens it in a new browser tab
  sidebar.component.tsx               Sidebar (app page): logo + one hash link per route
popup/
  popup.html                          <div id="root">, loads index.js + index.css
  popup.css                           popup layout only (full-window card, period line)
  popup.app.tsx                       PopupApp: fetches the summary, holds the state
app/
  app.html                            <div id="root">, loads index.js + index.css
  app.css                             app page layout only (flat sidebar + content grid, page title)
  app.app.tsx                         App: reads the hash route, renders Sidebar + the page
  pages/
    analytics.page.tsx                AnalyticsPage (empty)
    facts.page.tsx                    FactsPage (empty)
    tips.page.tsx                     TipsPage (empty)
    history.page.tsx                  HistoryPage (empty)
```

| File / folder                | Role                                                                  | Copied/bundled to                               |
| ---------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `popup/popup.html`           | Markup shell, only `#root`                                            | `popup/index.html`                              |
| `app/app.html`               | Markup shell, only `#root`, extension icon as favicon                 | `app/index.html`                                |
| `base.css`, `components.css` | Shared styles. Each entry imports them first, then its own layout CSS | bundled into `popup/index.css`, `app/index.css` |
| `popup/popup.app.tsx`        | `PopupApp`: sends `GET_USAGE_SUMMARY` in a `useEffect`, renders below | `entries/popup.entry.tsx` → `popup/index.js`    |
| `app/app.app.tsx`            | `App`: maps the hash route to a page component, sets `document.title` | `entries/app.entry.tsx` → `app/index.js`        |
| `app/pages/*.page.tsx`       | One component per route. Only the app page bundles them               | `entries/app.entry.tsx`                         |
| `components/*.component.tsx` | Presentational components. They only render props and fetch nothing   | whichever entry uses them                       |

- **Routing (app page):** hash based (`app/index.html#/tips`). `App` reads `location.hash`
  through `useSyncExternalStore` + `hashchange`. No router library. An empty or unknown hash
  shows `DEFAULT_ROUTE` (Analytics). Sidebar links are plain `#/<id>` anchors, so switching pages
  doesn't reload, and back/forward works.
- **Routes** live in `app-routes.ts` only. The popup's TabBar and the app's Sidebar both render
  `APP_ROUTES`, so a new page is one entry there, one `*.page.tsx`, and one line in `PAGES`
  (`app.app.tsx`). `app-routes.ts` doesn't import the pages, so the popup bundle doesn't
  contain them.
- **Opening from the popup:** `TabBar` calls `chrome.tabs.create({ url: appRouteUrl(id) })`
  (no permission needed). Every click opens a new tab. Reusing an already open app tab would
  need the `tabs` permission.
- **State:** `PopupApp` holds one `UsageSummaryDto | null | undefined` (`undefined` = loading,
  `null` = no answer from the background). Components get plain values and show `–` while a
  value is `undefined`.
- **Data flow:** only the `*.app.tsx` root components send `chrome.runtime` messages.
  Components never fetch data. They may only navigate (`chrome.tabs.create`, hash links).
- The popup only lives while it is open, so nothing persists between openings.
- **Naming:** kebab-case file, PascalCase export (`breakdown-row.component.tsx` →
  `BreakdownRow`, `tips.page.tsx` → `TipsPage`). Function components only.

**Icons** come from [lucide-react](https://lucide.dev/icons/): import the component
(`import { Coins } from 'lucide-react'`) and render `<Coins />`. Only imported icons get bundled.
Size and color are set in CSS (`.lucide` in `base.css`, overrides in `components.css`), and icons
inherit `currentColor`. The icon list is in [styling.md](styling.md#icons).

May import: `dto/`, `messages/`, `config/` (section `ui`), `react`, `react-dom`, `lucide-react`.
Must not import: `handlers/`, `services/`, `readers/`.

---

## DTOs

`src/dto/` (shared): plain data contracts passed between layers and across contexts through
`chrome.runtime` messages. Types only: no logic and no imports from other layers. Everything
here must survive structured cloning (no classes, functions or DOM nodes).

| File                    | DTO                | From → To                                 |
| ----------------------- | ------------------ | ----------------------------------------- |
| `chat-capture.dto.ts`   | `ChatCaptureDto`   | chat reader → EstimationHandler           |
| `token-estimate.dto.ts` | `TokenEstimateDto` | EstimationService → EstimationHandler     |
| `prompt-record.dto.ts`  | `PromptRecordDto`  | EstimationHandler → PromptStoreService    |
| `usage-summary.dto.ts`  | `UsageSummaryDto`  | PromptStoreService → UsageHandler → popup |

Field reference: [dto.md](dto.md).

May import: nothing.

---

## Messages

`src/messages/` (shared): the contract for every `chrome.runtime` message, a discriminated union
on `type`, plus the response type of each message.

| `type`              | Sender  | Receiver   | Payload          | Response          |
| ------------------- | ------- | ---------- | ---------------- | ----------------- |
| `ESTIMATE_PROMPT`   | content | background | `ChatCaptureDto` | `PromptRecordDto` |
| `GET_USAGE_SUMMARY` | popup   | background | `{ sinceMs }`    | `UsageSummaryDto` |

May import: `dto/`.

---

## Config

`src/config/` (shared): every tunable value of the estimation and capture in one JSON file
([ADR 0012](decisions/0012-central-config.md)). To tune the estimate, edit `config.json`. No
TypeScript changes are needed.

| File              | Role                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `config.json`     | The values, one section per consumer (below)                                                                                        |
| `config.types.ts` | `WaisterConfig` and its parts (field docs), `ModelFamily<P>`, and the compile-time checks `CheckedConfig` / `CheckedFamilyDefaults` |

| Section                        | Used by                              | Values                                                                                                                         |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `estimation.thinking`          | EstimationService                    | `baselineMs`, `effortMultipliers` per `ThinkingEffort`                                                                         |
| `estimation.impact`            | EstimationService                    | `perTokensUnit` (what the `*Per1M` rates refer to), `roundingDecimals`                                                         |
| `estimation.models.<provider>` | EstimationService                    | `default` + `families.<family>`: `systemPromptTokens`, `tokensPerMsThinking`, `energyWhPer1M`, `waterMlPer1M`, `co2GramsPer1M` |
| `tokenizer.<provider>`         | TokenizerService                     | `turnFramingTokens`, `singleTokenMaxWordLength`, `charsPerSubword`, `digitChunkSize`, `charsPerSymbolToken`                    |
| `capture.timings`              | dom-capture strategy, Claude adapter | `settleMs`, `textStableMs`, `checkDelayMs`, `pollMs`, `stalePromptMs`, `claudeInterleavedStallMs`                              |
| `capture.effortInference`      | site adapters                        | `thinkingDetected`, `familyDefaults.<family>`                                                                                  |
| `ui`                           | PopupApp                             | `usageWindowHours`                                                                                                             |

- **Import by section:** `import { capture } from '../../config/config.json'`. esbuild
  tree-shakes JSON per top-level key, so each bundle only contains the sections it reads.
- **Checked by `tsc`:** a missing or mistyped field fails `npm run check` (`CheckedConfig`). The
  model families are the keys of `estimation.models.<provider>.families`. Renaming one breaks the
  reader that produces it, and a `familyDefaults` key without rates breaks `CheckedFamilyDefaults`.
- **Effort strings** (`thinkingDetected`, `familyDefaults`) are plain strings in JSON. The readers
  validate them and fall back to `unknown`, logging a warning.
- **Build-time only:** values are bundled. A change needs a rebuild.

May import: `dto/` (types only).
