# Modules

Reference for every folder and file in `src/`. The code is organized **by layer**, and each layer
runs in exactly one runtime context or is shared. Import rules are in
[architecture.md](architecture.md#layers--contexts).

Status: the pipeline is implemented end to end. The tokenizer is a character-based
approximation per provider, and the readers depend on each site's current DOM.

Every file starts with the same header: `<ModuleName>: <one line>`, `Context:` and a `Docs:`
anchor that points at a heading in this file. Don't rename a heading without updating the
anchors (`grep -rn "Docs: docs/modules.md#" src`).

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
| `content.entry.ts`    | `content.js` (IIFE)     | content    | `startDomCaptureStrategy()`                     |
| `background.entry.ts` | `background.js` (ESM)   | background | `chrome.runtime.onMessage` → message handler    |
| `popup.entry.tsx`     | `popup/index.js` (IIFE) | popup      | imports popup CSS + fonts, mounts `<PopupApp/>` |
| `app.entry.tsx`       | `app/index.js` (IIFE)   | app page   | imports app CSS + fonts, mounts `<App/>`        |

`css-imports.d.ts` is type-only: it declares `*.css` modules so that `tsc` accepts the CSS
imports in the `.entry.tsx` files (TypeScript 6 checks side-effect imports).

Why ESM for the background and IIFE for the others: see
[build-and-tooling.md](build-and-tooling.md#scriptsbuildmjs).

---

## Readers

`src/readers/` (content script): reads a finished prompt/response pair from the chat site's DOM
and produces one [`ChatCaptureDto`](dto.md#chatcapturedto). Nothing here tokenizes or estimates.
The content script stays thin and only sends plain text plus timing.

```
dom-content.reader.ts                Shared DOM -> markdown serializer, attachment, tool-call and artifact readers
sites/<site>.site.ts                 WHERE: DOM selectors, reads and state checks for one site
sites/site.helpers.ts                Helpers shared by the adapters (reads, turns, history, model labels)
sites/effort-inference.helpers.ts    Thinking-effort defaults from config
strategies/dom-capture.strategy.ts   WHEN: one turn-detection loop for all sites, calculates latencyMs & thinkingTimeMs, builds ChatCaptureDto
```

- **A site redesign** only touches that site's adapter (`CHATGPT_SELECTORS`, `CLAUDE_SELECTORS`, `GEMINI_SELECTORS`).
- **A new chat site** is a new `*.site.ts` that implements `SiteAdapter`, added to `SUPPORTED_SITES` (private) in `dom-capture.strategy.ts`.

May import: `dto/`, `messages/`, `config/` (section `capture`). Must not import: `handlers/`,
`services/`, `ui/`. Enforced by ESLint.

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

`effort-inference.helpers.ts` is internal to `sites/`: it reads `capture.effortInference` from
[`config.json`](#config) and validates the strings. `THINKING_DETECTED_EFFORT` is used when the UI
shows that thinking is on without a level. `familyDefaultEffort(family)` is used when there is no
thinking signal (e.g. `claude-haiku` → `none`, `gemini-flash` → `low`, otherwise `unknown`). The
model names a parser produces are typed `ModelFamily<provider>` (plus a generic fallback like
`'claude'`), so they can't drift from the rate table.

`site.helpers.ts` holds what the adapters share: `readText`, `latestOf`, `queryOutermost`,
`joinMarkdown`, `makeTurn`, `buildHistory`, `readTurnNodes`, `unknownModel` and `buildModelInfo` (the
label parser for Claude and Gemini, driven by `capture.models`).

**Adapter layout** (all three follow it): imports → selector table (not exported) → tool table →
derived `*_MESSAGE_CHROME` selector → private helpers (`read*`, `parse*`, `latest*`) → the exported
adapter. Thinking checks look at the latest assistant turn only. Selectors that were derived from
knowledge of the site but never checked on the live page carry a `// UNVERIFIED:` comment
(convention in `site-adapter.types.ts`). The Claude adapter is the one with side effects:
`isPromptInput` and `isSendButton` call `startTurn()` and `isGenerating` calls `tick()` to feed
its thinking-time aggregator.

Imports of the adapters: `config/` (`capture.models`, `capture.effortInference`),
`dom-content.reader.ts` (`outermost`, `domToMarkdown`, …) and `dto/`.

Contract (`site-adapter.types.ts`):

| Member                     | Returns                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `provider`                 | `Provider`                                                                           |
| `matches(host)`            | whether this adapter handles the page                                                |
| `readModel()`              | `ModelInfo` (name, version, thinking effort; `unknown` if not visible)               |
| `readUserInput()`          | reconstructed markdown of the latest user message                                    |
| `readUserAttachments()`    | `AttachmentKind[]` (`'image' \| 'file'`) on the latest user message                  |
| `readResponse()`           | reconstructed markdown of the latest assistant message (UI chrome stripped)          |
| `readArtifactText()`       | reconstructed markdown of an open artifact / canvas side panel (`''` if none)        |
| `readToolCalls()`          | `ToolCallKind[]` (`'search' \| 'code' \| 'other'`) on the latest assistant message   |
| `readHistory()`            | `ChatTurn[]` of all earlier turns (including user turn `attachments`)                |
| `countUserMessages()`      | number of user messages in the DOM (a newly sent prompt raises it)                   |
| `countResponses()`         | number of assistant responses in the DOM (a new response raises it)                  |
| `isGenerating()`           | whether a response is currently streaming                                            |
| `isStreamingVisibleText()` | whether visible output tokens have begun rendering in the latest assistant container |
| `isPromptInput(target)`    | whether an element is (inside) the prompt composer                                   |
| `isSendButton(target)`     | whether an element is (inside) the send button                                       |

#### Selectors per site

1. **ChatGPT (`chatgpt.site.ts` — `chatgpt.com`)**: ChatGPT serves different frontend shells depending on authentication state, and every selector covers all of them: the **logged-in** React / Codex app-shell (`#root`), the **logged-out** "web-mobile" Octane shell (`#web-mobile-root`), and the legacy classic app.
   - **Turns**: role nodes are `[data-user-message-bubble]` (user) and `[data-response-body]` (assistant) in the logged-in shell, `li[data-message-role]` in the logged-out web-mobile shell, or `[data-message-author-role]` in the classic app. Consecutive role nodes of the same author are merged into one turn, and role nodes nested inside another role node are skipped. Counts, response, user input and history all work on these turns. History = all turns before the latest user turn.
   - **Composer / send button**: `.ProseMirror[data-composer-markdown]` inside `form[data-chatgpt-composer]` (logged-in), `textarea#mobile-composer-prompt` (logged-out), or `#prompt-textarea` (classic); and `form[data-chatgpt-composer] button[type="submit"]` (logged-in), `button[data-composer-submit]:not([data-stop-generating])` (logged-out), or `button[data-testid="send-button"]` / `#composer-submit-button` (classic).
   - **Active generation / streaming**: composer stop button (`form[data-chatgpt-composer] button[aria-label="Stop"]`, `button[data-composer-submit][data-stop-generating]`, or `button[data-testid="stop-button"]`), page/turn streaming markers (`[data-response-starting]` during pre-token thinking, `[data-d-streaming-reveal]` during DIL token streaming, `[data-loading-indicator]`, `form[data-octane-followup-submitting]`, `.result-streaming`), or a logged-out assistant message (`[data-message-role="assistant"]`) with `data-message-streaming` or without `data-message-complete`.
   - **Visible text**: the latest assistant turn has text in a `[data-markdown-text-style="assistant-message"]` / `[data-dil-response]` (logged-in), `[data-assistant-markdown-root]` (logged-out), or `.markdown` (classic) block (the `[data-response-starting]` "Thinking" placeholder doesn't count). User text reads from `[data-user-message-bubble]`.
   - **Model**: `data-message-model-slug` of the latest answer when present, else the label of `[data-model-selection-label]` / `button[aria-label="Select ChatGPT model"]` / `[data-testid="model-switcher-dropdown-button"]` plus the composer `Think` toggle (`form[data-chatgpt-composer] button[aria-pressed="true"]`), else `unknown` (e.g. logged out).

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

### DOM content reader

`src/readers/dom-content.reader.ts`: shared helpers used by all three site adapters ([ADR 0013](decisions/0013-rich-message-content.md)):

- `domToMarkdown(root, options)`: walks a message DOM node, skips UI chrome (`button`, `svg`, `.sr-only`, `[aria-hidden="true"]`, plus site-specific chrome selectors), reconstructs markdown syntax (headings, bold/italic/strikethrough, ordered/unordered lists with nesting, blockquotes, pipe tables, `[label](url)` links, inline code, and fenced code blocks with language tags and preserved newlines/indentation), and extracts single TeX strings (`$...$` / `$$...$$`) from KaTeX/MathJax formulas.
- `outermost(root, selector)`: the matches at or inside `root` without ones nested in another match (`root` itself counts if it matches, `[]` for an empty selector).
- `readAttachments(roots, fileSelector)`: detects `'image'` and `'file'` attachments on a user turn. Images up to `capture.attachments.maxIconPx` count as icons, not attachments.
- `readToolCalls(roots, selectors)`: detects `'search'`, `'code'` and `'other'` tool calls on the latest assistant turn.
- `readArtifactText(roots, cardSelector, panelSelector)`: serializes the open artifact / canvas side panel when the latest answer contains an artifact card.

`hasMatch` and `collapseWhitespace` are private to this file.

### Reader strategies

`src/readers/strategies/` (CONSOLIDATION & WHEN): one turn-detection loop on top of the site
adapters. It builds the DTO only once the response has completely finished (`t1`). Timing details:
[pipeline.md](pipeline.md#1-reader--consolidated-strategy-content-script).

| File                      | Strategy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dom-capture.strategy.ts` | The one strategy. Exports only `startDomCaptureStrategy(onCapture?)`. Resolves the active `SiteAdapter` (`SUPPORTED_SITES`), detects `{ t0, tStreamStart, t1 }` with `observeTurns` (built on `createDebouncedTimer` and `createStateLogger`; `markPromptSent` calls `reset()`, which also clears `lastActivity`), computes `latencyMs` and `thinkingTimeMs`, reads `conversationUrl` (`location.origin + location.pathname` at `t1`), builds `ChatCaptureDto`, and sends it via `ESTIMATE_PROMPT` to `handleEstimation` in `estimation.handler.ts`. Logs `[waister]` lines to the page console: the send, each change of the detected state while a prompt is in flight (`generating`, user/response counts vs. baseline, response length), the capture, and why a prompt was dropped. |

`reader-strategy.types.ts` holds the types `TurnTimings` (`{ t0, tStreamStart, t1 }`) and
`OnCaptureReady`. There is no strategy interface: `observeTurns`, `buildChatCaptureDto`,
`resolveSiteAdapter` and `SUPPORTED_SITES` are private, and `content.entry.ts` calls
`startDomCaptureStrategy()` directly (see the update in
[ADR 0008](decisions/0008-turn-detection-in-strategy.md)).

The detection timings (settle, text-stable, check delay, poll, stale prompt) come from
`config.json` → `capture.timings`.

---

## Handlers

`src/handlers/` (background): orchestration only. Handlers receive input, call services in the
right order and return a result. They hold no domain logic of their own (no tokenizing, no
estimation formulas).

| File                    | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `message.handler.ts`    | Routes each `chrome.runtime` message by `type` to the matching handler: `ESTIMATE_PROMPT` → EstimationHandler, `GET_USAGE_SUMMARY` → UsageHandler. Returns `undefined` for an unknown type, so `background.entry.ts` answers `false` and doesn't keep the channel open.                                                                                                                                                                                                                                                                                                                    |
| `estimation.handler.ts` | **EstimationHandler**: `ChatCaptureDto` → `PromptRecordDto`. Gets visible counts from the TokenizerService and hidden counts from the EstimationService, has the EstimationService build the `TokenEstimateDto` (`totalTokens`), delegates to the ConversionService (`convertTokensToImpact`) to compute energy/water/CO2 impact, then has the PromptStoreService add a UUID + the conversation URL and save the row. `normalizeCaptureDto` first trims the text, clamps negative times, drops attachment and tool kinds it doesn't know (they count 0) and throws on an unknown provider. |
| `usage.handler.ts`      | **UsageHandler**: `handleGetUsageSummary(sinceMs)` → `UsageSummaryDto`, read straight from the PromptStoreService. No link to the estimation pipeline.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Style: plain exported functions (no classes). Services are imported directly. Pipeline details:
[pipeline.md](pipeline.md).

May import: `services/`, `dto/`, `messages/`. Must not import: `readers/`, `ui/`. Enforced by ESLint.

---

## Services

`src/services/` (background): domain logic, one folder per service. Each service is a module of
plain exported functions with a `*.service.ts` facade. Other files in the same folder are
internal to that service.

| Folder          | Service                                     | Job                                                               |
| --------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| `tokenizer/`    | [TokenizerService](#tokenizer-service)      | Counts the tokens of all **visible** text in the DTO              |
| `estimation/`   | [EstimationService](#estimation-service)    | Estimates **hidden** tokens (thinking, system/tool overhead)      |
| `conversion/`   | [ConversionService](#conversion-service)    | Converts token breakdown into energy (Wh), water (mL) and CO2 (g) |
| `prompt-store/` | [PromptStoreService](#prompt-store-service) | Saves every prompt to SQLite and answers the popup's queries      |

Rules:

- Services don't call handlers. Prefer services not calling each other either. The handler
  passes results along instead.
- Services are the only place for heavy dependencies (tokenizer vocabularies, WASM). They load
  once in the background, never in every tab.
- Other layers import a service only through its `*.service.ts` facade.

May import: `dto/`, `config/` (sections `estimation`, `tokenizer`). Must not import: `handlers/`,
`readers/`, `ui/`, `messages/`. Enforced by ESLint.

### Tokenizer service

`src/services/tokenizer/`: counts the **visible** tokens for `userInput` (plus `userAttachments`), `response` (plus `artifactText`) and each `chatHistory[]` turn (plus turn `attachments`). All parameters, including per-turn framing tokens and per-attachment token estimates, come from [`config.json`](#config) → `tokenizer.<provider>`. The calibration notes for each provider are JSDoc in `config.types.ts`. Hidden tokens are not counted here (see [EstimationService](#estimation-service)).

| File                     | Role                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokenizer.service.ts`   | `countVisibleTokens(capture)` → `{ input, history, output, approximate }`, built from `countInputTokens`, `countHistoryTokens`, `countOutputTokens`. Holds the `COUNTERS: Record<Provider, …>` table. |
| `heuristic.tokenizer.ts` | `createHeuristicTokenizer(params)`: the one character-based algorithm (letter runs, digit chunks, symbol runs), Unicode-aware (`\p{L}`, `\p{N}`)                                                      |

- **One table, not one file per provider:** `COUNTERS` maps each provider to a counter built from
  its config section. A real tokenizer can replace a single entry without touching the others
  ([ADR 0006](decisions/0006-per-provider-tokenizers.md)).
- **Whitespace:** the heuristic ignores it, so `countWhitespaceTokens` adds tokens per newline run
  and per leading indentation run (`tokenizer.whitespace`: `newlineRunTokens`, `indentRunTokens`,
  `indentMinSpaces`).
- **Framing:** each non-empty input and history turn gets `turnFramingTokens`. The new answer gets
  none. That is an assumption.
- **Unknown attachment kinds** count 0 (and are dropped earlier by `normalizeCaptureDto`).

### Estimation service

`src/services/estimation/`: estimates the **hidden** tokens and builds the final `TokenEstimateDto`.

All rates and constants come from [`config.json`](#config) → `estimation`.

- `thinking` = `max(0, min(thinkingTimeMs, latencyMs) − baselineMs) × tokensPerMsThinking × effortMultiplier[thinkingEffort]`,
  capped at `estimation.thinking.maxTokens`
  (**hidden output**: internal reasoning / chain-of-thought tokens generated by the model before the visible answer starts streaming; scales dynamically with `thinkingTimeMs`, which can't exceed the whole response time).
- `tools` = sum of `estimation.tools[provider][kind]` over `capture.toolCalls`
  (**hidden tool context**: web search result snippets, code execution inputs/outputs, and other tool calls).
- `overhead` = `systemPromptTokens` of the model
  (**hidden input**: the provider's invisible system prompt, safety/formatting instructions, and built-in tool definitions like web search, code execution, or canvas/artifacts sent with every turn; fixed per model profile).
- See [pipeline.md — Thinking vs. Overhead](pipeline.md#thinking-vs-overhead) for a full comparison.
- `totalTokens` = input + history + output + thinking + tools + overhead. The handler passes the visible
  counts in, so the services don't call each other.

| File                    | Role                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `estimation.service.ts` | `estimateHiddenTokens(capture)`, `estimateThinkingTokens(...)`, `estimateToolTokens(...)`, `buildTokenEstimateDto(capture, visible, hidden)` |
| `model-profiles.ts`     | Internal. `ESTIMATION_CONFIG` (the typed `estimation` section) and `resolveModelProfile(provider, model)` → family rates or provider default |

### Conversion service

`src/services/conversion/`: converts the estimated token `breakdown` of a prompt into environmental
`impact` (`energyWh`, `waterMl`, `co2Grams`) using the per-model `energyWhPer1M`, per-category
`tokenEnergyProfile` + `cachedInputMultiplier`, uniform `waterMlPerWh`, and vendor-specific
`co2GramsPerWh` in [`config.json`](#config) → `estimation.models` and `estimation.impact`. Called by
the EstimationHandler right after `buildTokenEstimateDto`.

| File                    | Role                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversion.service.ts` | `convertTokensToImpact(estimateDto)` → `TokenEstimateDto` with `impact` populated, plus `calculateEnvironmentalImpact(tokens, provider, model)` |

### Prompt store service

`src/services/prompt-store/`: the database. Every estimated prompt becomes one row in the SQLite
`prompts` table, and the popup's queries are answered from it
([ADR 0009](decisions/0009-sqlite-prompt-store.md)). **Metrics only, no chat text.**

| File                      | Role                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt-store.service.ts` | Schema + SQL. `createPromptRecord(capture, estimate)` (adds `crypto.randomUUID()` and `conversationUrl`), `savePromptRecord(record)`, `getUsageSummary(sinceMs)` (token, breakdown and impact sums, oldest `captured_at`) |
| `sqlite-database.ts`      | Internal. Inits `@sqlite.org/sqlite-wasm` once, restores/saves the IndexedDB snapshot, `getDatabase(schema)`, `writeAndPersist(schema, write)`                                                                            |

- **Persistence:** MV3 service workers can't use the OPFS VFSes, so the database runs in memory.
  After every insert the whole database is exported and written to IndexedDB (`waister` →
  store `sqlite`, key `main`). The next start of the worker restores it. Writes are queued, so
  snapshots land in the same order as the inserts.
- **Corrupt snapshot:** if restoring fails, the bad snapshot is backed up under the IndexedDB key
  `main.corrupt` (only the latest one is kept) and the worker starts with a fresh database.
- `SchemaSetup` (`sqlite-database.ts`) is a plain function `(db) => void`. `prompt-store.service.ts`
  provides it as `applySchema`.
- **Table `prompts`:** `id` (UUID, PK), `conversation_url`, `captured_at` (indexed), `provider`,
  `model_name`, `model_version`, `thinking_effort`, `model_raw_label`, `input_tokens`,
  `history_tokens`, `output_tokens`, `thinking_tokens`, `tool_tokens`, `overhead_tokens`, `total_tokens`,
  `latency_ms`, `thinking_time_ms`, `approximate` (0/1), `energy_wh`, `water_ml`, `co2_grams`.
- The schema runs on every start (`applySchema`) and must stay idempotent (`CREATE TABLE IF NOT EXISTS` plus `pragma_table_info('prompts')` checks that run `ALTER TABLE` for columns in `ADDED_COLUMNS` such as `tool_tokens`).

---

## UI

`src/ui/` (popup + app page): everything the user sees, written in **React + TSX**
([ADR 0010](decisions/0010-react-popup.md)). There are two surfaces, and each is its own
esbuild entry ([ADR 0011](decisions/0011-app-page.md)):

- **Popup** (`ui/popup/`, toolbar button): the dashboard. When opened, it asks the database for
  the last 24 hours (`GET_USAGE_SUMMARY { sinceMs: now − 24 h }`) and shows the summed
  `totalTokens`, the breakdown (input, history, output, thinking, tools, overhead), the
  accumulated energy (Wh), water (mL) and CO2 (g) tachos, and the prompt count. A tab bar at the bottom
  opens the app page.
- **App page** (`ui/app/`, a full browser tab at `app/index.html`): a sidebar plus one page per
  route (Dashboard, Analytics, Facts, Tips, History). The Dashboard
  ([ADR 0014](decisions/0014-dashboard-page.md)) shows tokens, energy, water and CO2 for a chosen
  timeframe. The other pages are empty placeholders for now.

Neither surface talks to the estimation pipeline.

```
base.css                              shared: fonts, color/font tokens (incl. --power* / --water* / --co2*), element defaults
app-routes.ts                         shared: APP_ROUTES (id, label, icon), hash ↔ route, extension URLs
usage-api.ts                          shared: fetchUsageSummary(sinceMs) + useUsageSummary hook (roots only), fills fields a stale worker lacks
format.helpers.ts                     shared: formatCount, formatMetric (tachos), formatEnergy / formatWater / formatCo2 (auto-scaled Quantity, cards)
timeframe.helpers.ts                  app page: TIMEFRAMES (Today, Last week, Last 30 days, All time), timeframeSinceMs
components/                           shared components (used by either surface)
  components.css                      styles of all components, one block each
  header.component.tsx                Header: full logo, centered (/logo/waister-full.svg), popup and app page
  total.component.tsx                 Total: icon + summed token count (a <div>)
  breakdown.component.tsx             Breakdown: the six rows (order, labels, icons)
  breakdown-row.component.tsx         BreakdownRow: icon, label, count of one part
  tacho.component.tsx                 ImpactTachos: three semi-circular tacho gauges for energy (Wh), water (mL), CO2 (g)
  tab-bar.component.tsx               TabBar (popup): one fixed-width tab per route, opens it in a new browser tab
  sidebar.component.tsx               Sidebar (app page): logo + one hash link per route
  page-title.component.tsx            PageTitle (app page): serif headline of every page
  timeframe-picker.component.tsx      TimeframePicker (dashboard): one chip per timeframe (aria-pressed)
  power-card.component.tsx            PowerCard (dashboard): energy, pulsing number, lightning + gears scene
  water-card.component.tsx            WaterCard (dashboard): water, drops falling into a swaying pool
  co2-card.component.tsx              Co2Card (dashboard): CO2, a small factory puffing rising, fading clouds
popup/
  popup.html                          <div id="root">, loads index.js + index.css
  popup.css                           popup layout only (full-window card, `.popup-period` line)
  popup.app.tsx                       PopupApp: fetches the last 24h summary, renders it
app/
  app.html                            <div id="root">, loads index.js + index.css
  app.css                             app page layout only (flat sidebar + content grid, dashboard grid)
  app.app.tsx                         App: reads the hash route, holds the timeframe, fetches the summary, renders Sidebar + the page
  pages/
    dashboard.page.tsx                DashboardPage: title, picker, token subtitle, PowerCard + WaterCard + Co2Card
    dashboard.helpers.ts              dashboardAnimation(summary): pulse / drip / puff period, pool fill, cloud count from config
    analytics.page.tsx                AnalyticsPage (empty)
    facts.page.tsx                    FactsPage (empty)
    tips.page.tsx                     TipsPage (empty)
    history.page.tsx                  HistoryPage (empty)
```

| File / folder                | Role                                                                   | Copied/bundled to                               |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| `popup/popup.html`           | Markup shell, only `#root`                                             | `popup/index.html`                              |
| `app/app.html`               | Markup shell, only `#root`, extension icon as favicon                  | `app/index.html`                                |
| `base.css`, `components.css` | Shared styles. Each entry imports them first, then its own layout CSS  | bundled into `popup/index.css`, `app/index.css` |
| `popup/popup.app.tsx`        | `PopupApp`: `useUsageSummary(now − 24 h)`, renders below               | `entries/popup.entry.tsx` → `popup/index.js`    |
| `app/app.app.tsx`            | `App`: hash route → page, `document.title`, dashboard timeframe + data | `entries/app.entry.tsx` → `app/index.js`        |
| `app/pages/*.page.tsx`       | One component per route. Only the app page bundles them                | `entries/app.entry.tsx`                         |
| `components/*.component.tsx` | Presentational components. They only render props and fetch nothing    | whichever entry uses them                       |

- **Routing (app page):** hash based (`app/index.html#/tips`). `App` reads `location.hash`
  through `useSyncExternalStore` + `hashchange`. No router library. An empty or unknown hash
  shows `DEFAULT_ROUTE` (Dashboard). Sidebar links are plain `#/<id>` anchors, so switching pages
  doesn't reload, and back/forward works.
- **Routes** live in `app-routes.ts` only. The popup's TabBar and the app's Sidebar both render
  `APP_ROUTES`, so a new page is one entry there, one `*.page.tsx`, and one line in `PAGES`
  (`app.app.tsx`). The dashboard is the exception: it gets props, so `App` renders it directly.
  `app-routes.ts` doesn't import the pages, so the popup bundle doesn't contain them.
- **Dashboard:** `App` holds the `TimeframeId` (starts on Today, not remembered) and fetches
  `useUsageSummary(timeframeSinceMs(timeframe))`. The `sinceMs` is fixed per selection, so a
  rolling window doesn't refetch on every render. `DashboardPage` turns the summary into
  `pulseMs` / `dripMs` / `poolFill` (`dashboard.helpers.ts`, formula and values in
  `config.json` → `ui.dashboard`, field docs in `DashboardConfig`). `null` periods mean no usage,
  so the card stands still. The motion itself is pure CSS driven by custom properties
  (`--pulse`, `--drip`, `--drop-fall`), see [styling.md](styling.md#motion).
- **Opening from the popup:** `TabBar` calls `chrome.tabs.create({ url: appRouteUrl(id) })`
  (no permission needed). Every click opens a new tab. Reusing an already open app tab would
  need the `tabs` permission.
- **State:** `useUsageSummary` (`usage-api.ts`) holds one `SummaryState` =
  `UsageSummaryDto | null | undefined` (`undefined` = loading, `null` = no usable answer from the
  background). It treats a missing response and an `{ error }` response as `null`, ignores a
  result that arrives after unmount or a newer request, and keeps the previous summary while a
  new window loads. Components get plain values and show `–` (`formatCount`, `formatEnergy`, …)
  while a value is `undefined`.
- **Data flow:** only the `*.app.tsx` root components send `chrome.runtime` messages (through
  `useUsageSummary`). Pages and components never fetch data. They may only navigate
  (`chrome.tabs.create`, hash links).
- The popup only lives while it is open, so nothing persists between openings.
- **Naming:** kebab-case file, PascalCase export (`breakdown-row.component.tsx` →
  `BreakdownRow`, `tips.page.tsx` → `TipsPage`). Function components only.

**Icons** come from [lucide-react](https://lucide.dev/icons/): import the component
(`import { Coins } from 'lucide-react'`) and render `<Coins />`. Only imported icons get bundled.
Sizes are set per component in `components.css` (`.lucide` in `base.css` holds the defaults), and
the icon color once in a grouped rule there. The icon list is in [styling.md](styling.md#icons).

May import: `dto/`, `messages/`, `config/` (section `ui`), `react`, `react-dom`, `lucide-react`.
Must not import: `handlers/`, `services/`, `readers/`. Enforced by ESLint.

---

## DTOs

`src/dto/` (shared): plain data contracts passed between layers and across contexts through
`chrome.runtime` messages. Types only: no logic and no imports from other layers. Everything
here must survive structured cloning (no classes, functions or DOM nodes).

| File                    | DTO                | From → To                                           |
| ----------------------- | ------------------ | --------------------------------------------------- |
| `chat-capture.dto.ts`   | `ChatCaptureDto`   | reader strategy → EstimationHandler                 |
| `token-estimate.dto.ts` | `TokenEstimateDto` | EstimationService → EstimationHandler               |
| `prompt-record.dto.ts`  | `PromptRecordDto`  | EstimationHandler → PromptStoreService              |
| `usage-summary.dto.ts`  | `UsageSummaryDto`  | PromptStoreService → UsageHandler → popup, app page |

Field reference: [dto.md](dto.md).

May import: nothing.

---

## Messages

`src/messages/` (shared): the contract for every `chrome.runtime` message, a discriminated union
on `type`, plus the response type of each message.

| `type`              | Sender          | Receiver   | Payload          | Response                                          |
| ------------------- | --------------- | ---------- | ---------------- | ------------------------------------------------- |
| `ESTIMATE_PROMPT`   | content         | background | `ChatCaptureDto` | `PromptRecordDto` (the content script ignores it) |
| `GET_USAGE_SUMMARY` | popup, app page | background | `{ sinceMs }`    | `UsageSummaryDto` (`UsageSummaryResponse`)        |

On a handler failure the listener answers `{ error: string }`. An unknown `type` gets no answer
(the listener returns `false`).

May import: `dto/`.

---

## Config

`src/config/` (shared): every tunable value of the estimation and capture in one JSON file
([ADR 0012](decisions/0012-central-config.md)). To tune the estimate, edit `config.json`. No
TypeScript changes are needed.

| File              | Role                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.json`     | The values, one section per consumer (below)                                                                                                              |
| `config.types.ts` | `WaisterConfig` and its parts (**field docs and the assumptions behind the numbers**), `ModelFamily<P>`, and the compile-time checks (`CheckedConfig`, …) |

The field list, units and calibration notes live in `config.types.ts`, not here. Sections:

| Section                            | Used by                              | What it holds                                                                                                                |
| ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `estimation.thinking`              | EstimationService                    | thinking baseline, token cap (`maxTokens`), effort multipliers                                                               |
| `estimation.impact`                | ConversionService                    | unit, rounding, per-category energy profile, KV-cache multiplier, water/Wh, vendor CO2/Wh                                    |
| `estimation.tools`                 | EstimationService                    | per-provider hidden tokens per tool call (`search`, `code`, `other`)                                                         |
| `estimation.models.<provider>`     | EstimationService, ConversionService | `default` + `families.<family>`: system prompt size, thinking speed, base `energyWhPer1M`                                    |
| `tokenizer.<provider>`             | TokenizerService                     | heuristic parameters, turn framing, attachment estimates                                                                     |
| `tokenizer.whitespace`             | TokenizerService                     | tokens per newline run and indentation run (`newlineRunTokens`, `indentRunTokens`, `indentMinSpaces`)                        |
| `capture.timings`                  | dom-capture strategy, Claude adapter | turn-detection timings                                                                                                       |
| `capture.attachments`              | DOM content reader                   | `maxIconPx`: images up to this size are icons, not attachments                                                               |
| `capture.effortInference`          | site adapters                        | effort when thinking is detected / per family default                                                                        |
| `capture.models.claude`, `.gemini` | site adapters                        | `fallbackName`, `families` (name → label keywords), `thinkingKeywords`                                                       |
| `capture.models.chatgpt`           | ChatGPT adapter                      | `families`, `effortWords`, `slug.*` and `label.*` (regex sources for the model slug and picker label)                        |
| `ui`                               | PopupApp, ImpactTachos               | `usageWindowHours`, `tachoMax` (`energyWh`, `waterMl`, `co2Grams`)                                                           |
| `ui.dashboard`                     | Dashboard (`dashboard.helpers.ts`)   | `busyDay` (Wh / mL / g per day = intensity 1), `intensityExponent`, `pulseMs`, `dripMs`, `puffMs`, `cloudRiseMs`, `poolFill` |

- **Import by section:** `import { capture } from '../../config/config.json'`. esbuild
  tree-shakes JSON per top-level key, so each bundle only contains the sections it reads.
- **Checked by `tsc`:** a missing or mistyped field fails `npm run check` (`CheckedConfig`). The
  model families are the keys of `estimation.models.<provider>.families`. Renaming one breaks the
  reader that produces it, and a `familyDefaults` or `capture.models.*.families` key without rates breaks
  `CheckedFamilyDefaults` / `CheckedModelKeywordFamilies`.
- **Effort strings** (`thinkingDetected`, `familyDefaults`) are plain strings in JSON. The readers
  validate them and fall back to `unknown`, logging a warning.
- **Regex sources** under `capture.models.chatgpt` are plain strings, compiled case-insensitively by
  the ChatGPT adapter.
- **Build-time only:** values are bundled. A change needs a rebuild.

May import: `dto/` (types only).
