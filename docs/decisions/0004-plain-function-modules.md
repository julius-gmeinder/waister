# 0004: Plain function modules, no classes

**Status:** Accepted (2026-11-20)

## Context

The domain uses names like EstimationHandler and TokenizerService. These could be classes with
constructor injection or modules of plain functions.

## Decision

Plain function modules. The names refer to modules (`estimation.handler.ts`,
`tokenizer.service.ts`) that export functions. Handlers import services directly.

## Consequences

- Less boilerplate, and it fits esbuild tree-shaking.
- To swap an implementation (e.g. a fake tokenizer in tests), use module mocking or pass the
  function in as a parameter where that's needed. There is no DI container.
