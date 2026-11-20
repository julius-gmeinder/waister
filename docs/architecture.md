# Architecture

## Overview

A Manifest V3 browser extension. A content script reads the chat page, the background estimates
the tokens, and the popup shows the result.

```
 chat page DOM (chatgpt.com · claude.ai · gemini.google.com)
        │
        ▼
┌─ content script ─────────────────────────────────────────────┐
│  readers/sites/<site>.site.ts      WHERE  (DOM reads)        │
│  readers/strategies/<x>.strategy   WHEN   (t0 sent, t1 done) │
│  readers/chat.reader.ts            → ChatCaptureDto          │
└───────────────────────────┬──────────────────────────────────┘
                            │ chrome.runtime message ESTIMATE_PROMPT
                            ▼
┌─ background (service worker) ────────────────────────────────┐
│  handlers/message.handler.ts       routes by message type    │
│  handlers/estimation.handler.ts    EstimationHandler         │
│     ├─ services/tokenizer/         visible tokens            │
│     ├─ services/estimation/        hidden tokens             │
│     └─ services/estimate-cache/    latest result per tab     │
│                                    → TokenEstimateDto        │
└───────────────────────────┬──────────────────────────────────┘
                            │ chrome.runtime message GET_LATEST_ESTIMATE
                            ▼
┌─ popup ──────────────────────────────────────────────────────┐
│  ui/popup/popup.view.ts            shows totalTokens         │
└──────────────────────────────────────────────────────────────┘
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
| `services/` | background | Domain logic (tokenize, estimate, cache) | `dto/`                           |
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

The pipeline ends at **one token number per prompt**
([ADR 0005](decisions/0005-tokens-only-scope.md)). Nothing is stored long term. The estimate cache
is session-only.

## Extending

| Change                                | Where                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| New chat site                         | `readers/sites/<site>.site.ts` + register in `entries/content.entry.ts` + host in manifest |
| Different read timing                 | `readers/strategies/<x>.strategy.ts` + swap in `entries/content.entry.ts`                  |
| New provider tokenizer                | `services/tokenizer/<provider>.tokenizer.ts` + route in `tokenizer.service.ts`             |
| New model / version                   | entry in `services/estimation/model-profiles.ts`                                           |
| New runtime context (e.g. side panel) | `entries/<ctx>.entry.ts` + its layer folder + `scripts/build.mjs` + manifest               |
