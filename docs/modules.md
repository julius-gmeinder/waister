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
| [`ui/`](#ui)             | Popup that shows the last 24h of usage | popup                |
| [`dto/`](#dtos)          | Data contracts between layers          | shared               |
| [`messages/`](#messages) | `chrome.runtime` message contracts     | shared               |

---

## Entries

`src/entries/`: one file per runtime context. These are the esbuild entry points and contain
**wiring only**: no logic, just "pick the parts, connect them, register listeners".

| File                  | Bundle                  | Context    | Wires up                                     |
| --------------------- | ----------------------- | ---------- | -------------------------------------------- |
| `content.entry.ts`    | `content.js` (IIFE)     | content    | site adapter + reader strategy → chat reader |
| `background.entry.ts` | `background.js` (ESM)   | background | `chrome.runtime.onMessage` → message handler |
| `popup.entry.ts`      | `popup/index.js` (IIFE) | popup      | `ui/popup/popup.view`                        |

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

May import: `dto/`, `messages/`. Must not import: `handlers/`, `services/`, `ui/`.

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

1. **ChatGPT (`chatgpt.site.ts` — `chatgpt.com`)**:
   - **Composer / send button**: `#prompt-textarea` and `button[data-testid="send-button"]`.
   - **Active generation / streaming**: Checks for `button[data-testid="stop-button"]` or `.result-streaming` / `.streaming-animation`.
   - **Visible text**: the latest `[data-message-author-role="assistant"]` node's `.markdown.prose` block has text.
   - **Turns & model**: Reads turns via `[data-message-author-role="user"]` and `[data-message-author-role="assistant"] .markdown.prose`, and reads the active model from `[data-testid="model-switcher-dropdown-button"]`.

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

| File                      | Strategy                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dom-capture.strategy.ts` | Default consolidated strategy. Resolves the active `SiteAdapter`, detects `{ t0, tStreamStart, t1 }` with `observeTurns`, computes `latencyMs` and `thinkingTimeMs`, reads `conversationUrl` (`location.origin + location.pathname` at `t1`), builds `ChatCaptureDto`, and sends it via `ESTIMATE_PROMPT` to `handleEstimation` in `estimation.handler.ts`. Logs `[waister]` lines to the page console. |

Contract (`reader-strategy.types.ts`): `start(onCapture?, host?, customAdapters?)`, plus the
`TurnTimings` type `{ t0, tStreamStart, t1 }`.

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

May import: `dto/`. Must not import: `handlers/`, `readers/`, `ui/`, `messages/`.

### Tokenizer service

`src/services/tokenizer/`: counts the **visible** tokens for `userInput`, `response` and each
`chatHistory[]` turn. Per-turn framing tokens come from `tokenizer-lookup.json` in the same folder.
Hidden tokens are not counted here (see [EstimationService](#estimation-service)).

| File                     | Provider    | Role / Difference across sites                                                                                                                      |
| ------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokenizer.service.ts`   | (router)    | `countVisibleTokens(capture)` → `{ input, history, output, approximate }`, built from `countInputTokens`, `countHistoryTokens`, `countOutputTokens` |
| `tokenizer-lookup.json`  | (lookup)    | `turnFramingTokens` per provider (chat-template control tokens per turn)                                                                            |
| `openai.tokenizer.ts`    | `openai`    | Calibrated for OpenAI's `o200k_base` BPE (~4.0 chars/token, 1–3 digit number chunks) + 4 ChatML turn-framing tokens                                 |
| `anthropic.tokenizer.ts` | `anthropic` | Calibrated for Claude's BPE (~3.7 chars/token, denser subword splits) + 5 turn-framing tokens                                                       |
| `google.tokenizer.ts`    | `google`    | Calibrated for Gemini's 256k SentencePiece unigram vocabulary (~4.1 chars/token) + 4 turn-delimiter tokens                                          |

### Estimation service

`src/services/estimation/`: estimates the **hidden** tokens and builds the final `TokenEstimateDto`.

- `thinking` = `max(0, thinkingTimeMs − 250) × tokensPerMsThinking × effortMultiplier[thinkingEffort]`
  (**hidden output**: internal reasoning / chain-of-thought tokens generated by the model before the visible answer starts streaming; scales dynamically with `thinkingTimeMs`).
- `overhead` = `systemPromptTokens` of the model
  (**hidden input**: the provider's invisible system prompt, safety/formatting instructions, and built-in tool definitions like web search, code execution, or canvas/artifacts sent with every turn; fixed per model profile).
- See [pipeline.md — Thinking vs. Overhead](pipeline.md#thinking-vs-overhead) for a full comparison.
- `totalTokens` = input + history + output + thinking + overhead. The handler passes the visible
  counts in, so the services don't call each other.

It also computes an environmental `impact` (`energyWh`, `waterMl`, `co2Grams`) from
`energy-lookup.json`. That value stays in the background and is **not shown** in the popup.

| File                    | Role                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `estimation.service.ts` | `estimateHiddenTokens(capture)`, `estimateThinkingTokens(...)`, `buildTokenEstimateDto(capture, visible, hidden)`, `calculateEnvironmentalImpact(...)`                |
| `model-profiles.ts`     | Per provider + model: hidden-token rates (`systemPromptTokens`, `tokensPerMsThinking`), `THINKING_EFFORT_MULTIPLIERS`, and the energy rates from `energy-lookup.json` |
| `energy-lookup.json`    | Plain JSON lookup table mapping each provider/model to `energyWhPer1M`, `waterMlPer1M`, and `co2GramsPer1M` (per 1M tokens)                                           |

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

`src/ui/` (popup): everything the user sees. For now that's just the toolbar popup.

May import: `dto/`, `messages/`. Must not import: `handlers/`, `services/`, `readers/`.

### Popup

`src/ui/popup/`: when opened, the popup asks the database for the last 24 hours
(`GET_USAGE_SUMMARY { sinceMs: now − 24 h }`) and shows the summed `totalTokens`, the breakdown
(input, history, output, thinking, overhead) and the prompt count. It never talks to the
estimation pipeline. The layout is deliberately plain for now.

| File            | Role                                   | Copied/bundled to                    |
| --------------- | -------------------------------------- | ------------------------------------ |
| `popup.html`    | Markup, loads `index.js` + `index.css` | `popup/index.html`                   |
| `popup.css`     | Styles                                 | `popup/index.css`                    |
| `popup.view.ts` | Fetches the 24h summary and renders it | bundled via `entries/popup.entry.ts` |

The popup only lives while it is open, so it keeps no state of its own.

**Icons** come from [lucide](https://lucide.dev/icons/) (npm `lucide`, bundled into
`popup/index.js`). `popup.html` holds `<i data-lucide="name">` placeholders, and `popup.view.ts`
replaces them with inline SVGs through `createIcons`. Only the icons listed in `POPUP_ICONS` in
`popup.view.ts` get bundled, so a new icon has to be added in two places: imported and listed in
`POPUP_ICONS` as `PascalCase`, and used in the HTML as `kebab-case`. Size and color are set in
`popup.css` (`.lucide`), and icons inherit `currentColor`. The icon list is in
[styling.md](styling.md#icons).

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
