# 0005: Scope ends at one token number

**Status:** Superseded by [0009](0009-sqlite-prompt-store.md) (2026-11-20)

## Context

Earlier drafts converted tokens further and stored results in SQLite (WASM).

## Decision

The pipeline ends at `TokenEstimateDto.totalTokens`, one estimated token number per prompt. No
further conversion and no long-term persistence. Only the latest estimate per tab is kept, in
`chrome.storage.session`.

## Consequences

- SQLite is out of scope. The `@sqlite.org/sqlite-wasm` dependency and the `sqlite3.wasm`
  build step are leftovers to remove.
- Adding later stages would need a new ADR.
