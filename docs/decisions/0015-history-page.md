# 0015: History page with paged prompt list and detail modal

**Status:** Accepted (2026-11-21)

## Context

Every prompt is saved as a metrics row ([ADR 0009](0009-sqlite-prompt-store.md)), but the UI
only ever showed sums (popup, Dashboard). The History route was an empty placeholder. Users want
to see single prompts: which ones were expensive, how the breakdown splits, which model and
effort ran them, and get back to the conversation.

## Decision

- **New message `GET_PROMPT_HISTORY`** with a `PromptHistoryQuery` (`sinceMs`, `providers`,
  `sort`, `offset`, `limit`) → `PromptHistoryDto` (`records` + `summary`). Handled by the existing
  UsageHandler, answered by `getPromptHistory` in the PromptStoreService. `GET_USAGE_SUMMARY`
  stays as it is.
- **Summary and page in one answer:** the totals of everything matching the filter come with
  every page (same `WHERE` builder), so the summary strip and "x of y" never disagree with the
  list, and no second message is needed.
- **Offset paging with "Load more"** (`ui.history.pageSize` = 50 in `config.json`). Sort orders
  come from a whitelist with deterministic tie-breakers. The UI drops ids it already has, because
  a prompt saved between two pages shifts the offset by one.
- **Filters:** the Dashboard's TimeframePicker (History starts on All time), a ProviderFilter
  (multi-toggle chips, none = all) and a SortPicker (newest, oldest, most tokens, most energy).
  Time orders are grouped by local day with per-day totals; metric orders are a flat ranking
  with dates, because day groups would split a ranking.
- **Data flow stays as before:** `App` owns the `HistoryView` and calls `usePromptHistory`
  (`ui/usage-api.ts`). The hook only runs while the History is open and restarts on every visit.
  `HistoryPage` renders props; its only state is the open prompt.
- **Detail view as a native `<dialog>`** (`showModal()`): focus trap, Escape and the top layer come
  from the browser, no portal or library. It shows the breakdown (stacked TokenBar + legend
  split into visible/counted and hidden/estimated, with counts and shares), the impact (energy,
  water, CO2 tiles in their accents), model & timings, and a link to the conversation (only
  `http(s)` URLs). ← / → step through the loaded rows. Everyday comparisons are left for later.
- **Token category colors** `--token-*`: six new tokens, validated as a categorical set in
  stacking order. Hidden segments are hatched in the big bar and legend, so "estimated" doesn't
  rely on color alone. The order, labels and icons of the categories moved from the Breakdown
  into `components/token-category.helpers.ts`, shared by the Breakdown, the TokenBar and the modal.

## Consequences

- The History reads rows, not sums, so it is the first UI that grows with the database. Paging
  keeps each message small; the whole database still lives in memory in the worker (ADR 0009).
- Day totals only cover loaded rows, so the last day reads "so far" while more pages exist.
- The modal is the second floating surface after the Dashboard cards (border, radius, shadow).
- Rejected alternatives: infinite scroll (needs an observer and makes the end of the list hard
  to reach); loading everything at once (grows without bound); grouping by conversation (users
  chose day groups); a second message for the totals (two round trips that could disagree);
  per-day totals from SQL (needs the local time zone inside the WASM build, which isn't
  reliable).
