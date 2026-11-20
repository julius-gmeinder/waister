# 0009: Save every prompt to SQLite, popup reads only the database

**Status:** Accepted (2026-11-20). Supersedes [0005](0005-tokens-only-scope.md).

## Context

The popup showed only the latest estimate of the active tab, read from a per-tab cache in
`chrome.storage.session`. To show usage over time (first: the last 24 hours), every prompt has to
be kept, and the popup should not depend on the estimation pipeline at all.

## Decision

- After the estimate, the EstimationHandler gives each prompt a random UUID and saves it as one
  row of the SQLite `prompts` table: the full `TokenEstimateDto` (breakdown, total, model,
  timings, `approximate`, `impact`) plus the conversation URL. **Metrics only, no chat text.**
- The conversation URL is read by the content script at `t1` (`ChatCaptureDto.conversationUrl`).
- SQLite (`@sqlite.org/sqlite-wasm`) lives in a new background service,
  `services/prompt-store/`. MV3 service workers can't use the OPFS VFSes, so the database is
  in memory and a snapshot of it is written to IndexedDB after every insert and restored on start.
- The popup reaches the database only through the `GET_USAGE_SUMMARY { sinceMs }` message,
  answered by `handlers/usage.handler.ts`, which only queries the store. Estimation writes,
  the popup reads, and the two never talk to each other.
- The per-tab estimate cache (`services/estimate-cache/`, `GET_LATEST_ESTIMATE`) is removed.

## Consequences

- WASM loads once, in the background only. `ui/` still imports only `dto/` and `messages/`.
- The manifest needs `'wasm-unsafe-eval'` in the extension CSP, and `sqlite3.wasm` is copied next
  to `background.js` (found through `import.meta.url`, which is why the background stays ESM).
- `unlimitedStorage` keeps the IndexedDB snapshot from being evicted. `storage` and `tabs` are no
  longer needed and were removed.
- Each insert rewrites the whole snapshot. That's fine for metric rows (a few hundred bytes each),
  but a retention policy or a different VFS (e.g. an offscreen document with OPFS) may be needed
  if the table grows very large.
- Rejected alternative: the popup opening SQLite itself through a shared `db/` layer. That would
  ship the WASM in the popup and break the rule that only `dto/` and `messages/` are shared.
