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
