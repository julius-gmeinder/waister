# 0006: One tokenizer per provider

**Status:** Accepted (2026-11-20)

## Context

OpenAI, Anthropic and Google tokenize differently. OpenAI publishes its encodings. Anthropic
and Google don't offer an official client-side tokenizer for current models.

## Decision

`services/tokenizer/` has a router (`tokenizer.service.ts`) and one module per provider
(`openai.tokenizer.ts`, `anthropic.tokenizer.ts`, `google.tokenizer.ts`) with the same shape.

## Consequences

- Each provider can be improved on its own, from approximate to exact.
- Approximate counts set `TokenEstimateDto.approximate`.
- Bundle size grows with each vocabulary. It only affects the background bundle.

## Update 2026-11-21

The three per-provider files (`openai.tokenizer.ts`, `anthropic.tokenizer.ts`,
`google.tokenizer.ts`) were deleted. They only passed their config section to the shared
heuristic, so they added files but no behavior. Now each provider has its own `tokenizer.<provider>`
section in `config.json` (its calibration notes are JSDoc in `config.types.ts`), and
`tokenizer.service.ts` holds one `COUNTERS: Record<Provider, …>` table built from
`heuristic.tokenizer.ts`. The decision itself stands: a provider is counted on its own, and a real
tokenizer replaces exactly one `COUNTERS` entry without touching the others.
