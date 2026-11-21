# Waister docs

Waister is a browser extension that estimates how many tokens one prompt to an AI chat web app
(ChatGPT, Claude, Gemini) uses in total, including the tokens you can't see.

All project documentation lives in this folder.

| Document                                     | What it covers                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| [architecture.md](architecture.md)           | Layers, runtime contexts, import rules, data flow                        |
| [modules.md](modules.md)                     | Reference for every folder and file in `src/`                            |
| [pipeline.md](pipeline.md)                   | The estimation pipeline step by step, and how the single number is built |
| [dto.md](dto.md)                             | Field reference for all DTOs                                             |
| [build-and-tooling.md](build-and-tooling.md) | Build scripts, TypeScript, ESLint (layer import rules), formatting       |
| [styling.md](styling.md)                     | Logos, color variables, fonts and icons of the popup and app page        |
| [decisions/](#architecture-decision-records) | Architecture decision records (ADRs)                                     |

Using and debugging the extension in Chrome and Firefox: root [README.md](../README.md).

## Architecture decision records

Short records of structural decisions: context, decision, consequences. Add a new numbered file
to `decisions/` when a decision changes. Don't rewrite old ones; mark them
_Superseded by NNNN_ instead.

| #    | Decision                                                                                                 | Status                              |
| ---- | -------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 0001 | [Organize `src/` by layer](decisions/0001-layered-structure.md)                                          | Accepted                            |
| 0002 | [Reader in content script, estimation in background](decisions/0002-context-split.md)                    | Accepted                            |
| 0003 | [DOM reading with site adapters + swappable strategies](decisions/0003-dom-readers.md)                   | Accepted                            |
| 0004 | [Plain function modules, no classes](decisions/0004-plain-function-modules.md)                           | Accepted                            |
| 0005 | [Scope ends at one token number](decisions/0005-tokens-only-scope.md)                                    | Superseded by 0009                  |
| 0006 | [One tokenizer per provider](decisions/0006-per-provider-tokenizers.md)                                  | Accepted, updated 2026-11-21        |
| 0007 | [Response as its own DTO field](decisions/0007-response-field.md)                                        | Accepted                            |
| 0008 | [Turn detection in the strategy](decisions/0008-turn-detection-in-strategy.md)                           | Accepted                            |
| 0009 | [Save every prompt to SQLite, popup reads only the database](decisions/0009-sqlite-prompt-store.md)      | Accepted                            |
| 0010 | [Popup built with React + TSX components](decisions/0010-react-popup.md)                                 | Accepted, layout superseded by 0011 |
| 0011 | [Full-page app page with hash routes, ui/ split per surface](decisions/0011-app-page.md)                 | Accepted                            |
| 0012 | [All tunable values in one shared config.json](decisions/0012-central-config.md)                         | Accepted                            |
| 0013 | [Markdown reconstruction, attachments, artifacts and tool calls](decisions/0013-rich-message-content.md) | Accepted                            |
| 0014 | [Dashboard page with timeframes and animated impact cards](decisions/0014-dashboard-page.md)             | Accepted                            |
| 0015 | [History page with paged prompt list and detail modal](decisions/0015-history-page.md)                   | Accepted                            |
