# Modules

Reference for every folder and file in `src/`. The code is organized **by layer**, and each layer
runs in exactly one runtime context or is shared. Import rules are in
[architecture.md](architecture.md#layers--contexts).

Status: backbone only. All `.ts` files are stubs (header comment + `export {};`).

| Folder                   | Layer                                  | Runs in              |
| ------------------------ | -------------------------------------- | -------------------- |
| [`entries/`](#entries)   | Entry points (one per context)         | each its own context |
| [`readers/`](#readers)   | Reads the chat page → `ChatCaptureDto` | content script       |
| [`handlers/`](#handlers) | Orchestration (messages, estimation)   | background           |
| [`services/`](#services) | Tokenizing, estimating, caching        | background           |
| [`ui/`](#ui)             | Popup that shows the token number      | popup                |
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
sites/<site>.site.ts          WHERE: DOM selectors and reads for one site
strategies/<x>.strategy.ts    WHEN:  detects "sent" (t0) and "response finished" (t1)
chat.reader.ts                joins both and builds the DTO (latencyMs = t1 - t0)
```

- **A site redesign** only touches that site's adapter.
- **A new way of reading** (e.g. polling, or a network hook later) is a new strategy file plus a
  one-line change in `entries/content.entry.ts`.
- **A new chat site** is a new `*.site.ts` that implements `SiteAdapter`, registered in the
  entry.

May import: `dto/`, `messages/`. Must not import: `handlers/`, `services/`, `ui/`.

### Site adapters

`src/readers/sites/` (WHERE): one adapter per supported chat web app. An adapter only knows
**where** things are in that site's DOM and exposes synchronous, side-effect-free reads. It never
decides _when_ to read.

| File              | Site    | Host                | Provider    |
| ----------------- | ------- | ------------------- | ----------- |
| `chatgpt.site.ts` | ChatGPT | `chatgpt.com`       | `openai`    |
| `claude.site.ts`  | Claude  | `claude.ai`         | `anthropic` |
| `gemini.site.ts`  | Gemini  | `gemini.google.com` | `google`    |

Contract (`site-adapter.types.ts`, planned):

| Member            | Returns                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `provider`        | `Provider`                                                             |
| `matches(host)`   | whether this adapter handles the page                                  |
| `readModel()`     | `ModelInfo` (name, version, thinking effort; `unknown` if not visible) |
| `readUserInput()` | text of the latest user message                                        |
| `readResponse()`  | text of the latest assistant message                                   |
| `readHistory()`   | `ChatTurn[]` of all earlier turns                                      |
| `isGenerating()`  | whether a response is currently streaming                              |

Selectors break when the sites ship UI changes. Keep them in one place at the top of each
adapter so they are quick to fix.

### Reader strategies

`src/readers/strategies/` (WHEN/HOW): a strategy decides **when** the reader should look at the
page. It uses the site adapter's reads but never touches selectors itself, so any strategy works
with any site.

| File                            | Strategy                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `mutation-observer.strategy.ts` | Default. Observes DOM mutations and uses `isGenerating()` to detect t0 (prompt sent) and t1 (response finished). |

Contract (`reader-strategy.types.ts`, planned): `start(adapter, onCapture)` / `stop()`.
`onCapture` receives the t0/t1 timestamps. The chat reader then reads the texts and builds the
DTO.

Possible later strategies (not planned yet): polling, or a `MAIN`-world `fetch` hook that reads
the streamed API responses (more exact, more fragile, needs a `postMessage` bridge).

---

## Handlers

`src/handlers/` (background): orchestration only. Handlers receive input, call services in the
right order and return a result. They hold no domain logic of their own (no tokenizing, no
estimation formulas).

| File                    | Role                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message.handler.ts`    | Routes each `chrome.runtime` message by `type` to the matching handler or service.                                                                                                                    |
| `estimation.handler.ts` | **EstimationHandler**: `ChatCaptureDto` → `TokenEstimateDto`. Calls the TokenizerService, then the EstimationService, sums everything into `totalTokens` and stores the result in the estimate cache. |

Style: plain exported functions (no classes). Services are imported directly. Pipeline details:
[pipeline.md](pipeline.md).

May import: `services/`, `dto/`, `messages/`. Must not import: `readers/`, `ui/`.

---

## Services

`src/services/` (background): domain logic, one folder per service. Each service is a module of
plain exported functions with a `*.service.ts` facade. Other files in the same folder are
internal to that service.

| Folder            | Service                                         | Job                                                          |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `tokenizer/`      | [TokenizerService](#tokenizer-service)          | Counts the tokens of all **visible** text in the DTO         |
| `estimation/`     | [EstimationService](#estimation-service)        | Estimates **hidden** tokens (thinking, system/tool overhead) |
| `estimate-cache/` | [EstimateCacheService](#estimate-cache-service) | Holds the latest estimate per tab for the popup              |

Rules:

- Services don't call handlers. Prefer services not calling each other either. The handler
  passes results along instead.
- Services are the only place for heavy dependencies (tokenizer vocabularies, WASM). They load
  once in the background, never in every tab.
- Other layers import a service only through its `*.service.ts` facade.

May import: `dto/`. Must not import: `handlers/`, `readers/`, `ui/`, `messages/`.

### Tokenizer service

`src/services/tokenizer/`: counts tokens for everything in the `ChatCaptureDto` that is text:
`userInput`, `response` and each `chatHistory[]` turn. Returns per-field counts, and the handler
sums them.

| File                     | Provider    | Accuracy                                                            |
| ------------------------ | ----------- | ------------------------------------------------------------------- |
| `tokenizer.service.ts`   | (router)    | Picks the module by `dto.provider` and returns the counts           |
| `openai.tokenizer.ts`    | `openai`    | Exact: OpenAI publishes its BPE encodings                           |
| `anthropic.tokenizer.ts` | `anthropic` | Approximate: no public tokenizer for current Claude models          |
| `google.tokenizer.ts`    | `google`    | Approximate: SentencePiece-based, no official client-side tokenizer |

Each provider module exposes the same shape (planned): `countTokens(text, model) → number`.
Mark approximate counts as such so the result can say how exact it is.

Open: which libraries or vocabularies to use, and how big they may get in the bundle.

### Estimation service

`src/services/estimation/`: estimates the tokens the page does **not** show:

- **Thinking/reasoning tokens:** derived from `latencyMs`, the model's output speed and the
  visible output length, scaled by the thinking effort.
- **Overhead tokens:** system prompt, tool definitions and similar per-model constants.

| File                    | Role                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `estimation.service.ts` | `estimateHiddenTokens(model, latencyMs, visibleCounts)`                                                              |
| `model-profiles.ts`     | Data table, one entry per provider + model + version: output tokens/s, time to first token, overhead, effort factors |

Unknown models fall back to a per-provider default profile. That fallback must show up in the
result. Formula sketch: [pipeline.md](pipeline.md#3-estimationservice-hidden-tokens).

### Estimate cache service

`src/services/estimate-cache/`: keeps the **latest** `TokenEstimateDto` per tab so the popup can
show it. Backed by `chrome.storage.session` because MV3 stops the background worker when it is
idle, which wipes in-memory state.

- Session-scoped only: cleared when the browser closes. No history, no SQLite.
- Planned API: `setLatest(tabId, estimate)`, `getLatest(tabId)`.

---

## UI

`src/ui/` (popup): everything the user sees. For now that's just the toolbar popup.

May import: `dto/`, `messages/`. Must not import: `handlers/`, `services/`, `readers/`.

### Popup

`src/ui/popup/`: when opened, the popup asks the background for the active tab's latest estimate
(`GET_LATEST_ESTIMATE`) and shows `totalTokens`. The breakdown is optional.

| File            | Role                                   | Copied/bundled to                    |
| --------------- | -------------------------------------- | ------------------------------------ |
| `popup.html`    | Markup, loads `index.js` + `index.css` | `popup/index.html`                   |
| `popup.css`     | Styles                                 | `popup/index.css`                    |
| `popup.view.ts` | Fetches the estimate and renders it    | bundled via `entries/popup.entry.ts` |

The popup only lives while it is open, so it keeps no state of its own.

---

## DTOs

`src/dto/` (shared): plain data contracts passed between layers and across contexts through
`chrome.runtime` messages. Types only: no logic and no imports from other layers. Everything
here must survive structured cloning (no classes, functions or DOM nodes).

| File                    | DTO                | From → To                       |
| ----------------------- | ------------------ | ------------------------------- |
| `chat-capture.dto.ts`   | `ChatCaptureDto`   | chat reader → EstimationHandler |
| `token-estimate.dto.ts` | `TokenEstimateDto` | EstimationHandler → popup       |

Field reference: [dto.md](dto.md).

May import: nothing.

---

## Messages

`src/messages/` (shared): the contract for every `chrome.runtime` message, a discriminated union
on `type`, plus the response type of each message.

| `type`                | Sender  | Receiver   | Payload          | Response                   |
| --------------------- | ------- | ---------- | ---------------- | -------------------------- |
| `ESTIMATE_PROMPT`     | content | background | `ChatCaptureDto` | `TokenEstimateDto`         |
| `GET_LATEST_ESTIMATE` | popup   | background | `{ tabId }`      | `TokenEstimateDto \| null` |

May import: `dto/`.
