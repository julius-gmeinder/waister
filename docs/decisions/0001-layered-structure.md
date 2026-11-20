# 0001: Organize `src/` by layer

**Status:** Accepted (2026-11-20)

## Context

The previous backbone (`8c56420`) grouped code by runtime context (`content/`, `background/`,
`popup/`, `shared/`). The team prefers a classic layered layout where handlers, services and
DTOs are visible as such.

## Decision

Top-level folders are layers: `entries/`, `readers/`, `handlers/`, `services/`, `ui/`, `dto/`,
`messages/`. Each layer is assigned to exactly one runtime context (or "shared"), and
`entries/` holds one esbuild entry point per context.

## Consequences

- The roles of Handler, Service and DTO are obvious from the tree.
- Context boundaries are no longer implied by the folder names. They live in
  `docs/architecture.md` and must be enforced by ESLint `no-restricted-imports` per layer.
- `scripts/build.mjs` and `eslint.config.js` need updating (see `docs/build-and-tooling.md`).
