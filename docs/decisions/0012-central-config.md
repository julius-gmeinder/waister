# 0012: All tunable values in one shared config.json

**Status:** Accepted (2026-11-21).

## Context

The estimation depends on many guessed values: hidden-token rates per model, thinking-effort
multipliers, the thinking baseline, tokenizer heuristics, energy/water/CO2 rates, and the capture
timings that decide `latencyMs` and `thinkingTimeMs`. They were spread over TypeScript constants
in six files plus two JSON lookups (`energy-lookup.json`, `tokenizer-lookup.json`), with some
duplicates (the `unknown` multiplier, `perTokensUnit`). The three provider tokenizers were the
same algorithm with four different numbers each. Model-family names were typed separately in the
readers and in the rate tables, so a mismatch silently fell back to the provider default.

## Decision

- **One file:** `src/config/config.json`, sectioned by consumer: `estimation` (thinking,
  impact, per-model rates), `tokenizer` (per-provider heuristic parameters + turn framing),
  `capture` (detection timings, thinking-effort inference), `ui` (popup usage window).
- **New shared layer `config/`** that every layer except `dto/` may import. `config/` itself
  imports only types from `dto/`. Code imports sections by name
  (`import { capture } from '../../config/config.json'`), so esbuild tree-shakes the JSON: the
  content script bundles only `capture`, the background only `estimation` + `tokenizer`.
- **Types:** `config/config.types.ts` describes the shape. `CheckedConfig` makes `tsc` check the
  whole JSON against it. `ModelFamily<P>` is derived from the keys in `estimation.models`. The
  readers type the model names they produce with it, so renaming a family in the JSON fails the
  typecheck. `CheckedFamilyDefaults` checks the `familyDefaults` keys. JSON strings are typed
  `string`, so effort values are validated at runtime (`readers/sites/effort-inference.ts`,
  falling back to `unknown`).
- **Per-model rates merged:** hidden-token rates and impact rates live in one entry per model
  family (`estimation.models.<provider>.families.<family>`), so both use the same keys.
- **Tokenizers:** `heuristic.tokenizer.ts` holds the one algorithm. The three provider files stay
  ([ADR 0006](0006-per-provider-tokenizers.md)) and pass their config section to it, so a real
  tokenizer can still replace one of them.
- **Not in the config:** DOM selectors, watched attributes, keyword matching for model labels,
  IndexedDB names and log prefixes. Those are code, not tuning values.

## Consequences

- Tuning the estimate means editing one JSON file. No TypeScript changes, and a structural
  mistake fails `npm run check`.
- Build-time only: values are bundled. Changing them at runtime (e.g. an options page) would need
  a storage-backed override later.
- The unreachable fallbacks (`defaults` in both old lookups, used only for providers outside the
  `Provider` union) were dropped.
- Rejected alternatives: background-only config (the capture timings would stay hardcoded),
  `src/config.json` without a folder (no place for its types), merging the provider tokenizers
  into one file (would undo ADR 0006).

## Update 2026-11-21

- **Model knowledge moved into the config.** "Keyword matching for model labels" is no longer
  code: `capture.models.claude` and `capture.models.gemini` hold `fallbackName`, `families` and
  `thinkingKeywords`, and `capture.models.chatgpt` holds `effortWords` plus the `slug.*` and
  `label.*` regex sources. The matching logic stays in the site adapters (`buildModelInfo`,
  `chatgpt.site.ts`). Family keys are type-checked against `estimation.models`
  (`CheckedModelKeywordFamilies`).
- New keys: `estimation.thinking.maxTokens`, `tokenizer.whitespace`, `capture.attachments.maxIconPx`.
  The top-level `description` was removed.
- The provider tokenizer files are gone, see the update in [ADR 0006](0006-per-provider-tokenizers.md).
- The effort validation lives in `readers/sites/effort-inference.helpers.ts`.
