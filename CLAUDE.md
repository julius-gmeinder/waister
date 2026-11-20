# CLAUDE.md

## Project

**Waister** is a Manifest V3 browser extension (TypeScript, esbuild) that estimates the
**total token usage of a single prompt** in AI chat web apps: **ChatGPT** (`chatgpt.com`),
**Claude** (`claude.ai`) and **Gemini** (`gemini.google.com`). The output is one number per
prompt, shown in the toolbar popup. University project (semester 3).

## Domain

- **Prompt:** one user message plus the assistant's answer to it.
- **Visible tokens:** tokens of text that appears on the page. They are counted with a
  provider-specific tokenizer:
  - **input**: the new user message
  - **history**: all earlier turns, which the chat app re-sends as context on every prompt
  - **output**: the visible answer
- **Hidden tokens:** tokens that never appear on the page. They are estimated:
  - **thinking**: reasoning tokens, inferred from latency, model output speed and thinking effort
  - **overhead**: system prompt and tool definitions per model
- **totalTokens** = input + history + output + thinking + overhead. This is _the_ number.
- **Provider:** `openai`, `anthropic` or `google`. **Model:** name + version + thinking effort, as
  far as the site's UI shows them.
- **latencyMs:** time from sending the prompt until the response finished streaming.
- **Out of scope:** anything beyond tokens, and long-term storage. SQLite was removed.

## Architecture (by layer)

```
content:     readers/  (sites/ = WHERE, strategies/ = WHEN) → ChatCaptureDto
                 │ chrome.runtime ESTIMATE_PROMPT
background:  handlers/estimation.handler (EstimationHandler)
                 ├─ services/tokenizer   (TokenizerService, one module per provider)
                 ├─ services/estimation  (EstimationService + model-profiles)
                 └─ services/estimate-cache (chrome.storage.session)
                 → TokenEstimateDto
popup:       ui/popup  ← GET_LATEST_ESTIMATE
shared:      dto/, messages/
entries/:    one esbuild entry per context, wiring only
```

All docs live in `docs/` only. Start at `docs/README.md`. The per-module reference is
`docs/modules.md`, and decisions are in `docs/decisions/`. Don't add README files inside `src/`.

## Rules

- **Respect context boundaries.** `readers/` = content only, `handlers/` + `services/` =
  background only, `ui/` = popup only. Only `dto/` and `messages/` are shared. Allowed imports
  per layer are in `docs/architecture.md`. Never import background code into content/popup.
  Cross context only through `messages/`.
- **Plain function modules, no classes.** Handlers orchestrate, services compute, DTOs are plain
  structured-clone-safe data.
- **File names:** kebab-case + role suffix (`*.entry.ts`, `*.reader.ts`, `*.site.ts`,
  `*.strategy.ts`, `*.handler.ts`, `*.service.ts`, `*.tokenizer.ts`, `*.dto.ts`, `*.types.ts`).
- **Keep docs in sync:** when you add, move or change a module, update its section in
  `docs/modules.md` (and the `Docs:` anchor in the file header) and, if it affects them,
  `docs/architecture.md`, `docs/pipeline.md`, `docs/dto.md`. A structural decision gets a new
  ADR.
- Structure changes are discussed first: ask the user (questionnaire) before reorganizing.

## Status

Pipeline implemented end to end (readers → handler → tokenizer/estimation services → cache →
popup). The popup shows token usage only (total + breakdown). The background also computes an
energy/water `impact`, which is not displayed. `npm run build` works. `eslint.config.js` still targets the old
per-context layout. The required changes are in `docs/build-and-tooling.md`.

## Commands

```sh
npm run dev        # watch build into dist/waister/ (load unpacked in the browser)
npm run dev:firefox  # same, with the Firefox manifest (also build:firefox, zip:firefox)
npm run build      # production build
npm run check      # typecheck + lint + prettier check, run before committing
npm run zip        # package for store upload
```

Using and debugging the extension in Chrome/Firefox: root `README.md`.
