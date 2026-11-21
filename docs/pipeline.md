# Estimation pipeline

Goal: for every prompt the user sends in a supported chat app, produce **one number**, the
estimated total token usage of that prompt, and save it to the database.

```
Reader ──ChatCaptureDto──▶ EstimationHandler ──▶ TokenizerService   (visible)
                                    │         ├─▶ EstimationService  (hidden)
                                    │         └─▶ ConversionService  (energy, water, CO2)
                                    ▼
                           TokenEstimateDto { totalTokens, breakdown, impact }
                                    │ + UUID + conversationUrl
                                    ▼
                           PromptStoreService ──INSERT──▶ SQLite `prompts`

Popup ──GET_USAGE_SUMMARY──▶ UsageHandler ──▶ PromptStoreService ──SELECT──▶ UsageSummaryDto
```

## 1. Reader & Consolidated Strategy (content script)

`readers/strategies/dom-capture.strategy.ts`, consolidating the site adapters (`chatgpt.site.ts`,
`claude.site.ts`, `gemini.site.ts`).

```
User sends prompt (t0)
  │
  ├─▶ [Thinking / pre-stream phase]
  │
  ▼
Visible stream starts (tStreamStart)  ──▶ thinkingTimeMs = tStreamStart − t0
  │
  ├─▶ [Tokens streaming into DOM]
  │
  ▼
Stream finishes & settles (t1)        ──▶ latencyMs = t1 − t0
  │
  ▼
Strategy reads { model, userInput, response, chatHistory[] } from SiteAdapter
  │
  ▼
Builds ChatCaptureDto & sends ESTIMATE_PROMPT ──▶ message.handler.ts ──▶ handleEstimation(dto)
```

`observeTurns(adapter, onCompleted)` in the strategy runs this for every site. It watches the whole
`document.body` with one `MutationObserver` (chat apps are SPAs and replace their containers on
navigation) and coalesces mutation bursts into one check per `checkDelayMs`. The adapter only answers DOM
questions (`countResponses()`, `isGenerating()`, `readResponse()`, …).

1. **Prompt sent (`t0`)**: Enter (without Shift) in the composer with non-empty text
   (`isPromptInput`), or a click on the send button (`isSendButton`). Fallback: `isGenerating()`
   turns true while no prompt is in flight. The current `countResponses()` becomes the baseline.
2. **Start of visible stream (`tStreamStart`)**: the first check where `countResponses()` is above
   the baseline and `isStreamingVisibleText()` is true.
3. **Response finished (`t1`)**: `isGenerating()` is false and the response text has not changed
   for `settleMs`. If `isGenerating()` was never true during the turn (e.g. the stop-button
   selector doesn't match a localized UI), the text must stay unchanged for `textStableMs`
   instead. `t1` is the time of the last change, not of the check. A prompt that never gets a
   response is dropped after `stalePromptMs`. All these timings come from
   `config/config.json` → `capture.timings`.
4. **DTO consolidation**: `dom-capture.strategy.ts` computes both:
   - `thinkingTimeMs = tStreamStart − t0` (delta between prompt send and start of visible stream) (an adapter with
     interleaved thinking, i.e. Claude, may supply its own sum through `consumeThinkingTimeMs`)
   - `latencyMs = t1 − t0` (total time from prompt send until response completion)
     and queries the site adapter for `model`, `userInput`, `response`, and `chatHistory[]` to
     build a [`ChatCaptureDto`](dto.md#chatcapturedto). `conversationUrl` is
     `location.origin + location.pathname` at `t1`, so a new chat already has its final URL.
5. **Dispatch to `estimation.handler.ts`**: The strategy sends `ChatCaptureDto` via `chrome.runtime`
   message `ESTIMATE_PROMPT`, which `handlers/message.handler.ts` routes into
   `handleEstimation(captureDto)` in `handlers/estimation.handler.ts`.

## 2. TokenizerService: visible tokens

`services/tokenizer/tokenizer.service.ts` + `config/config.json` → `tokenizer` (per-provider
heuristic parameters and framing, `whitespace`). Entry point: `countVisibleTokens(capture)`.

| Count     | Source                         | How it works & why sites differ                                                                                                                                                                        |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `input`   | `userInput`, `userAttachments` | Markdown tokenized with the provider's tokenizer + whitespace runs + per-attachment token estimates (`image`, `file`) + `turnFramingTokens` (the chat-template control tokens wrapping the user turn). |
| `history` | every turn in `chatHistory[]`  | Chat apps re-send the whole conversation as context on every prompt. Each turn's reconstructed markdown and attachments are tokenized with the provider's tokenizer + `turnFramingTokens` per turn.    |
| `output`  | `response`, `artifactText`     | Reconstructed answer markdown + open Artifact/Canvas panel markdown tokenized with the provider's tokenizer + whitespace runs.                                                                         |

## 3. EstimationService: hidden tokens + DTO

`services/estimation/estimation.service.ts` + `services/estimation/model-profiles.ts`, values from
`config/config.json` → `estimation` (thinking baseline and cap, effort multipliers, per-model rates).
Entry points: `estimateHiddenTokens(capture)`, `buildTokenEstimateDto(capture, visible, hidden)`.

| Count      | Source                             | How                                                                                                                                            |
| ---------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `thinking` | `thinkingTimeMs`, `thinkingEffort` | `max(0, min(thinkingTimeMs, latencyMs) − baselineMs) × tokensPerMsThinking × effortMultiplier[thinkingEffort]`, capped at `thinking.maxTokens` |
| `tools`    | `toolCalls[]`                      | Sum of `estimation.tools[provider][kind]` per detected `search`, `code`, or `other` call                                                       |
| `overhead` | model profile                      | `systemPromptTokens` of the provider/model (system prompt + tool definitions)                                                                  |

### Thinking vs. Overhead

Both `thinking` and `overhead` are **hidden tokens** (they are processed or generated by the LLM on the server, but are not part of the visible prompt or answer text in the chat bubble). They represent two fundamentally different phases of a request:

| Aspect               | `overhead` (System & Tool Context)                                                                                                                                                            | `thinking` (Internal Reasoning / Chain-of-Thought)                                                                                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Direction**        | **Hidden input** (pre-filled into the model's context before generation starts).                                                                                                              | **Hidden output** (generated by the model before it starts writing the visible reply).                                                                                                                                                                                                                                   |
| **What it contains** | The provider's hidden system instructions (persona, safety rules, formatting rules, current date) plus built-in tool/function schemas (web search, code runner, canvas/artifacts, image gen). | Internal chain-of-thought tokens produced while the model plans, evaluates steps, or checks its reasoning prior to streaming the final answer.                                                                                                                                                                           |
| **How it scales**    | **Constant per prompt** for a given provider and model (`systemPromptTokens` in `config.json`), sent on every turn alongside `input` and `history`.                                           | **Dynamic per prompt**: scales with how long the model paused to reason before visible output began (`thinkingTimeMs` minus the `baselineMs` network baseline, never more than `latencyMs`), model speed (`tokensPerMsThinking`), and the active `thinkingEffort` (`effortMultipliers`), capped at `thinking.maxTokens`. |
| **When it is `0`**   | Never `0` on hosted chat apps, because every web chat session attaches a system prompt and tool definitions.                                                                                  | `0` when the model is explicitly non-reasoning (`thinkingEffort === 'none'`) or when the first visible token arrives within the `baselineMs` network baseline.                                                                                                                                                           |

Unknown models fall back to the provider default and set `approximate: true`.
`buildTokenEstimateDto` sums `totalTokens = input + history + output + thinking + tools + overhead`.

## 4. ConversionService: environmental impact

`services/conversion/conversion.service.ts`. Entry points: `convertTokensToImpact(estimateDto)`,
`calculateEnvironmentalImpact(totalTokens, provider, model)`.

Takes the `TokenEstimateDto` from `EstimationService` and converts `totalTokens` into energy,
water and CO2 using the model's rates in `config.json` (`estimation.models`, `estimation.impact`):

```
scale     = totalTokens / 1_000_000
energyWh  = scale × profile.energyWhPer1M
waterMl   = scale × profile.waterMlPer1M
co2Grams  = scale × profile.co2GramsPer1M
```

Returns the updated [`TokenEstimateDto`](dto.md#tokenestimatedto) with `impact` (`energyWh`,
`waterMl`, `co2Grams`) populated.

## 5. EstimationHandler: high-level orchestration

`handlers/estimation.handler.ts`

1. `normalizeCaptureDto(captureDto)` cleans the incoming capture data: trims text, clamps negative
   times, drops attachment and tool kinds it doesn't know (they would count 0) and throws on an
   unknown provider.
2. `countVisibleTokens(cleanedCapture)` (TokenizerService) counts input, history, output.
3. `estimateHiddenTokens(cleanedCapture)` (EstimationService) estimates thinking, tools and overhead.
4. `buildTokenEstimateDto(cleanedCapture, visible, hidden)` (EstimationService) sums `totalTokens` and builds the DTO.
5. `convertTokensToImpact(tokenEstimateDto)` (ConversionService) calculates `energyWh`, `waterMl` and `co2Grams` and attaches `impact`.
6. `createPromptRecord(cleanedCapture, estimateDto)` (PromptStoreService) adds a random UUID
   and the conversation URL, and `savePromptRecord(record)` inserts it into SQLite.

## 6. PromptStoreService: saving

`services/prompt-store/`. One row per prompt in the `prompts` table: id, conversation URL,
`captured_at`, provider, model (name, version, thinking effort, raw label), the six breakdown
counts, `total_tokens`, latency, thinking time, `approximate` and the impact. **No chat text.**
The database lives in memory, and a snapshot of it is written to IndexedDB after every insert and
restored when the service worker starts.

## 7. Popup

When opened, `PopupApp` (`ui/popup/popup.app.tsx`) sends `GET_USAGE_SUMMARY { sinceMs: now − 24 h }`.
`handlers/usage.handler.ts` passes it to `getUsageSummary(sinceMs)`, which sums all rows with
`captured_at >= sinceMs`. The popup shows the summed `totalTokens`, the breakdown, the accumulated
energy (Wh) and water (mL) tachos, and the prompt count. It has no link to the estimation pipeline.

## Open questions

- Tokenizer libraries for Anthropic/Google, and the bundle size budget.
- Where model profile numbers come from (published benchmarks, own measurements).
- Should `history` be capped by the model's context window?
