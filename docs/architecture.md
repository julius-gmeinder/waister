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
│     └─ services/prompt-store/      + UUID + URL → PromptRecordDto, INSERT │
│                                                                           │
│  services/prompt-store/            SQLite WASM (in memory, IndexedDB      │
│                                    snapshot after every insert)           │
│                                                                           │
│  handlers/usage.handler.ts         handleGetUsageSummary(sinceMs)         │
│     └─ services/prompt-store/      SELECT SUM(...) → UsageSummaryDto      │
└───────────────────────────▲───────────────────────────────────────────────┘
                            │ chrome.runtime message GET_USAGE_SUMMARY
                            │
┌─ popup ───────────────────────────────────────────────────────────────────┐
│  ui/popup/popup.view.ts            shows the last 24h of token usage      │
└───────────────────────────────────────────────────────────────────────────┘
```

## Layers → contexts

The code is organized **by layer** ([ADR 0001](decisions/0001-layered-structure.md)). Each layer
belongs to exactly one runtime context (or is shared). That keeps the extension's hard context
boundaries visible even without one folder per context.

| Layer       | Context    | Purpose                                  | May import                       |
| ----------- | ---------- | ---------------------------------------- | -------------------------------- |
| `entries/`  | each       | esbuild entry points, wiring only        | the layers of its own context    |
| `readers/`  | content    | DOM → `ChatCaptureDto`                   | `dto/`, `messages/`              |
| `handlers/` | background | Orchestration                            | `services/`, `dto/`, `messages/` |
| `services/` | background | Domain logic (tokenize, estimate, store) | `dto/`                           |
| `ui/`       | popup      | Presentation                             | `dto/`, `messages/`              |
| `messages/` | shared     | `chrome.runtime` message contracts       | `dto/`                           |
| `dto/`      | shared     | Data contracts                           | nothing                          |

Entry → layer mapping:

| Entry                         | Context    | Imports                 |
| ----------------------------- | ---------- | ----------------------- |
| `entries/content.entry.ts`    | content    | `readers/`, `messages/` |
| `entries/background.entry.ts` | background | `handlers/`             |
| `entries/popup.entry.ts`      | popup      | `ui/`                   |

**Why the boundaries matter:** each context is a separate JS world. esbuild bundles every entry
on its own, so a wrong import doesn't fail the build. It just silently copies background code
(e.g. a tokenizer vocabulary) into every tab's content script. The import rules prevent that
and will be enforced by ESLint (see [build-and-tooling.md](build-and-tooling.md#eslint)).

## Conventions

- **Plain function modules, no classes** ([ADR 0004](decisions/0004-plain-function-modules.md)).
  "EstimationHandler", "TokenizerService" etc. are module names, not classes.
- **File names:** kebab-case plus a role suffix: `*.entry.ts`, `*.reader.ts`, `*.site.ts`,
  `*.strategy.ts`, `*.handler.ts`, `*.service.ts`, `*.tokenizer.ts`, `*.dto.ts`, `*.types.ts`.
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
| New provider tokenizer                | `services/tokenizer/<provider>.tokenizer.ts` + route in `tokenizer.service.ts`             |
| New model / version                   | entry in `services/estimation/model-profiles.ts`                                           |
| New saved field / popup query         | `services/prompt-store/prompt-store.service.ts` (schema + query) + DTO + message           |
| New runtime context (e.g. side panel) | `entries/<ctx>.entry.ts` + its layer folder + `scripts/build.mjs` + manifest               |
