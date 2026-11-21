# Architecture

## Overview

A Manifest V3 browser extension. A content script reads the chat page, the background estimates
the tokens and saves every prompt to a SQLite database, and the popup reads that database.

```
 chat page DOM (chatgpt.com · claude.ai · gemini.google.com)
        │
        ▼
┌─ content script ──────────────────────────────────────────────────────────┐
│  readers/sites/<site>.site.ts            WHERE (selectors & DOM reads)    │
│  readers/strategies/dom-capture.strategy WHEN (turn detection) → DTO      │
│    (latencyMs = t1 - t0, thinkingTimeMs = tStreamStart - t0)              │
└───────────────────────────┬───────────────────────────────────────────────┘
                            │ chrome.runtime message ESTIMATE_PROMPT
                            ▼
┌─ background (service worker) ─────────────────────────────────────────────┐
│  handlers/message.handler.ts       routes messages by type                │
│  handlers/estimation.handler.ts    handleEstimation(ChatCaptureDto)       │
│     ├─ services/tokenizer/         visible tokens                         │
│     ├─ services/estimation/        hidden tokens → TokenEstimateDto       │
│     ├─ services/conversion/        tokens → energy, water, CO2 impact     │
│     └─ services/prompt-store/      + UUID + URL → PromptRecordDto, INSERT │
│                                                                           │
│  services/prompt-store/            SQLite WASM (in memory, IndexedDB      │
│                                    snapshot after every insert)           │
│                                                                           │
│  handlers/usage.handler.ts         handleGetUsageSummary(sinceMs)         │
│     └─ services/prompt-store/      SELECT SUM(...) → UsageSummaryDto      │
│                                    handleGetPromptHistory(query)          │
│                                    SELECT … LIMIT → PromptHistoryDto      │
└───────────────────────────▲───────────────────────────────────────────────┘
                            │ chrome.runtime message GET_USAGE_SUMMARY
                            │ (popup: last 24h · app page: selected timeframe)
                            │ + GET_PROMPT_HISTORY (app page: History pages)
┌─ popup ───────────────────────────────────────────────────────────────────┐
│  ui/popup/popup.app.tsx (React)    shows the last 24h of token usage      │
│  ui/components/tab-bar             opens a route in a new browser tab ──┐ │
└─────────────────────────────────────────────────────────────────────────┼─┘
                                                     chrome.tabs.create   │
┌─ app page (full browser tab, app/index.html#/<route>) ──────────────────▼─┐
│  ui/app/app.app.tsx (React)        Sidebar + Dashboard (tokens, energy,   │
│                                    water, CO2 per timeframe) · Analytics ·│
│                                    Facts · Tips · History (prompt list +  │
│                                    detail modal)                          │
└───────────────────────────────────────────────────────────────────────────┘
```

## Layers → contexts

The code is organized **by layer** ([ADR 0001](decisions/0001-layered-structure.md)). Each layer
belongs to exactly one runtime context (or is shared). That keeps the extension's hard context
boundaries visible even without one folder per context.

| Layer       | Context         | Purpose                                  | May import                       |
| ----------- | --------------- | ---------------------------------------- | -------------------------------- |
| `entries/`  | each            | esbuild entry points, wiring only        | the layers of its own context    |
| `readers/`  | content         | DOM → `ChatCaptureDto`                   | `dto/`, `messages/`, `config/`   |
| `handlers/` | background      | Orchestration                            | `services/`, `dto/`, `messages/` |
| `services/` | background      | Domain logic (tokenize, estimate, store) | `dto/`, `config/`                |
| `ui/`       | popup, app page | Presentation (React + TSX)               | `dto/`, `messages/`, `config/`   |
| `messages/` | shared          | `chrome.runtime` message contracts       | `dto/`                           |
| `config/`   | shared          | `config.json`: all tunable values        | `dto/` (types only)              |
| `dto/`      | shared          | Data contracts                           | nothing                          |

`config/` ([ADR 0012](decisions/0012-central-config.md)) is imported by section
(`import { capture } from '…/config/config.json'`), so esbuild bundles only that section into
the importing context.

Entry → layer mapping:

| Entry                         | Context    | Imports                 |
| ----------------------------- | ---------- | ----------------------- |
| `entries/content.entry.ts`    | content    | `readers/`, `messages/` |
| `entries/background.entry.ts` | background | `handlers/`             |
| `entries/popup.entry.tsx`     | popup      | `ui/`                   |
| `entries/app.entry.tsx`       | app page   | `ui/`                   |

The popup and the app page are both extension pages (same origin, same `chrome.*` APIs), so
`ui/` serves both. `ui/popup/` and `ui/app/` hold each surface's root, and `ui/components/` is
shared ([ADR 0011](decisions/0011-app-page.md)).

**Why the boundaries matter:** each context is a separate JS world. esbuild bundles every entry
on its own, so a wrong import doesn't fail the build. It just silently copies background code
(e.g. a tokenizer vocabulary) into every tab's content script. The import rules prevent that
and ESLint enforces them (`no-restricted-imports` per layer, see
[build-and-tooling.md](build-and-tooling.md#eslint)). Imports inside one layer folder are not
restricted.

## Conventions

- **Plain function modules, no classes** ([ADR 0004](decisions/0004-plain-function-modules.md)).
  "EstimationHandler", "TokenizerService" etc. are module names, not classes.
- **File names:** kebab-case plus a role suffix: `*.entry.ts(x)`, `*.reader.ts`, `*.site.ts`,
  `*.strategy.ts`, `*.handler.ts`, `*.service.ts`, `*.tokenizer.ts`, `*.dto.ts`, `*.types.ts`,
  `*.helpers.ts` (pure helpers internal to one folder, e.g. `readers/sites/site.helpers.ts`,
  `ui/format.helpers.ts`), and in `ui/` `*.app.tsx` (root component of a surface), `*.page.tsx` (one app page route) and
  `*.component.tsx` ([ADR 0010](decisions/0010-react-popup.md),
  [ADR 0011](decisions/0011-app-page.md)).
  **Exception, no renames:** folder-internal modules (`services/estimation/model-profiles.ts`,
  `services/prompt-store/sqlite-database.ts`) and the shared `messages/runtime-messages.ts`,
  `config/` files, `ui/app-routes.ts` and `entries/css-imports.d.ts` may omit the suffix.
- **Header comment:** every file starts with `<ModuleName>: <one line>`, then `Context:`
  (content, background, popup, app page or shared) and `Docs:` (an anchor in
  [modules.md](modules.md)). JSDoc for headers, exports and fields, `//` only for an in-body WHY.
  Comments say why, not what, and don't repeat these docs. Site adapters tag selectors that were
  never checked against the live page with `// UNVERIFIED:`.
- **React components** are function components with a PascalCase export
  (`breakdown-row.component.tsx` → `BreakdownRow`). Only the `*.app.tsx` root components fetch
  data, and the other components only render props.
- **Service facades:** other layers import a service only through its `*.service.ts`.
- **DTOs are plain data:** structured-clone safe, no logic.
- **Handlers orchestrate, services compute.** A handler never contains a formula, and a service
  never calls a handler.

## Scope

The pipeline produces **one token number per prompt** and saves every prompt (metrics only, no
chat text) to SQLite ([ADR 0009](decisions/0009-sqlite-prompt-store.md)). The popup never talks to
the estimation pipeline: estimation writes rows, the popup asks the database for a summary.

## Extending

| Change                                | Where                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| New chat site                         | `readers/sites/<site>.site.ts` + register in `entries/content.entry.ts` + host in manifest |
| Different read timing                 | `readers/strategies/<x>.strategy.ts` + swap in `entries/content.entry.ts`                  |
| Real tokenizer for one provider       | replace that provider's entry in `COUNTERS` (`tokenizer.service.ts`)                       |
| New model / version                   | `estimation.models` and `capture.models` in `config/config.json` (rates, label keywords)   |
| Tune a rate, heuristic or timing      | `config/config.json` only                                                                  |
| New saved field / popup query         | `services/prompt-store/prompt-store.service.ts` (schema + query) + DTO + message           |
| New popup element                     | `ui/components/<name>.component.tsx`, rendered from `ui/popup/popup.app.tsx`               |
| New app page (route)                  | entry in `ui/app-routes.ts` + `ui/app/pages/<name>.page.tsx` + `PAGES` in `app.app.tsx`    |
| New runtime context (e.g. side panel) | `entries/<ctx>.entry.ts` + its layer folder + `scripts/build.mjs` + manifest               |
