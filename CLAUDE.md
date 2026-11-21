# CLAUDE.md

## Project

**Waister** is a Manifest V3 browser extension (TypeScript, esbuild) that estimates the
**total token usage of a single prompt** in AI chat web apps: **ChatGPT** (`chatgpt.com`),
**Claude** (`claude.ai`) and **Gemini** (`gemini.google.com`). Every prompt is saved to a local
SQLite database, and the toolbar popup shows the token usage of the last 24 hours. University
project (semester 3).

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
- **Prompt record:** one saved prompt = estimate + UUID + conversation URL. Metrics only, no chat
  text ([ADR 0009](docs/decisions/0009-sqlite-prompt-store.md)).

## Architecture (by layer)

```
content:     readers/  (sites/ = WHERE, strategies/ = WHEN) → ChatCaptureDto
                 │ chrome.runtime ESTIMATE_PROMPT
background:  handlers/estimation.handler (EstimationHandler)
                 ├─ services/tokenizer   (TokenizerService, one module per provider)
                 ├─ services/estimation  (EstimationService + model-profiles)
                 └─ services/prompt-store (SQLite WASM, snapshot in IndexedDB) ← PromptRecordDto
             handlers/usage.handler → services/prompt-store → UsageSummaryDto
popup:       ui/popup/  (React, dashboard)  ← GET_USAGE_SUMMARY (reads only the database)
                 │ tab bar → chrome.tabs.create
app page:    ui/app/    (React, full tab, hash routes: analytics · facts · tips · history)
             ui/components/ + ui/base.css + ui/app-routes.ts shared by both
shared:      dto/, messages/, config/ (config.json: every tunable rate, heuristic and timing)
entries/:    one esbuild entry per context, wiring only
```

All docs live in `docs/` only. Start at `docs/README.md`. The per-module reference is
`docs/modules.md`, and decisions are in `docs/decisions/`. Don't add README files inside `src/`.

## Rules

- **Respect context boundaries.** `readers/` = content only, `handlers/` + `services/` =
  background only, `ui/` = popup + app page only. Only `dto/`, `messages/` and `config/` are
  shared. Allowed imports per layer are in `docs/architecture.md`. Never import background code
  into content/popup.
- **No magic numbers for estimation.** Rates, heuristics, effort defaults and capture timings live
  in `src/config/config.json` ([ADR 0012](docs/decisions/0012-central-config.md)), imported by
  section (`import { capture } from '…/config/config.json'`).
  Cross context only through `messages/`.
- **Plain function modules, no classes.** Handlers orchestrate, services compute, DTOs are plain
  structured-clone-safe data. React components are function components too.
- **File names:** kebab-case + role suffix (`*.entry.ts(x)`, `*.reader.ts`, `*.site.ts`,
  `*.strategy.ts`, `*.handler.ts`, `*.service.ts`, `*.tokenizer.ts`, `*.dto.ts`, `*.types.ts`,
  `*.app.tsx`, `*.page.tsx`, `*.component.tsx`).
- **UI (React):** only the `*.app.tsx` roots fetch data. `components/` only render props (and may
  navigate). Routes only in `ui/app-routes.ts`. Shared styles in `base.css` / `components.css`,
  surface layout in `popup.css` / `app.css`, colors only via the CSS variables
  (`docs/styling.md`).
- **Keep docs in sync:** when you add, move or change a module, update its section in
  `docs/modules.md` (and the `Docs:` anchor in the file header) and, if it affects them,
  `docs/architecture.md`, `docs/pipeline.md`, `docs/dto.md`. A structural decision gets a new
  ADR.
- Structure changes are discussed first: ask the user (questionnaire) before reorganizing.

## Status

Pipeline implemented end to end (readers → handler → tokenizer/estimation services → SQLite
prompt store). The popup (React + TSX, [ADR 0010](docs/decisions/0010-react-popup.md)) reads
the database and shows the last 24h of token usage (total, breakdown, prompt count). Its tab bar
opens the full-page app page ([ADR 0011](docs/decisions/0011-app-page.md)), whose four pages
(Analytics, Facts, Tips, History) are empty placeholders so far. The UI is deliberately plain for
now. The energy/water `impact` is
saved per prompt but not displayed. `npm run build` works. `eslint.config.js` still targets the old
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
