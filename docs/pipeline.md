# Estimation pipeline

Goal: for every prompt the user sends in a supported chat app, produce **one number**, the
estimated total token usage of that prompt.

```
Reader ──ChatCaptureDto──▶ EstimationHandler ──▶ TokenizerService   (visible)
                                    │         └─▶ EstimationService  (hidden)
                                    ▼
                           TokenEstimateDto { totalTokens, breakdown }
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
navigation) and coalesces mutation bursts into one check per 150 ms. The adapter only answers DOM
questions (`countResponses()`, `isGenerating()`, `readResponse()`, …).

1. **Prompt sent (`t0`)**: Enter (without Shift) in the composer with non-empty text
   (`isPromptInput`), or a click on the send button (`isSendButton`). Fallback: `isGenerating()`
   turns true while no prompt is in flight. The current `countResponses()` becomes the baseline.
2. **Start of visible stream (`tStreamStart`)**: the first check where `countResponses()` is above
   the baseline and `isStreamingVisibleText()` is true.
3. **Response finished (`t1`)**: `isGenerating()` is false and the response text has not changed
   for 400 ms. If `isGenerating()` was never true during the turn (e.g. the stop-button selector
   doesn't match a localized UI), the text must stay unchanged for 2.5 s instead. `t1` is the time
   of the last change, not of the check. A prompt that never gets a response is dropped after 2 min.
4. **DTO consolidation**: `dom-capture.strategy.ts` computes both:
   - `thinkingTimeMs = tStreamStart − t0` (delta between prompt send and start of visible stream)
   - `latencyMs = t1 − t0` (total time from prompt send until response completion)
     and queries the site adapter for `model`, `userInput`, `response`, and `chatHistory[]` to
     build a [`ChatCaptureDto`](dto.md#chatcapturedto).
5. **Dispatch to `estimation.handler.ts`**: The strategy sends `ChatCaptureDto` via `chrome.runtime`
   message `ESTIMATE_PROMPT`, which `handlers/message.handler.ts` routes into
   `handleEstimation(captureDto, tabId)` in `handlers/estimation.handler.ts`.

## 2. TokenizerService: visible tokens

`services/tokenizer/tokenizer.service.ts` + `services/tokenizer/tokenizer-lookup.json`
(`turnFramingTokens` per provider). Entry point: `countVisibleTokens(capture)`.

| Count     | Source                        | How it works & why sites differ                                                                                                                              |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `input`   | `userInput`                   | Tokenized with the provider's tokenizer (`openai`, `anthropic`, or `google`) plus `turnFramingTokens` (4–5 control tokens wrapping the user turn).           |
| `history` | every turn in `chatHistory[]` | Chat apps re-send the whole conversation as context on every prompt. Each turn is tokenized with the provider's tokenizer plus `turnFramingTokens` per turn. |
| `output`  | `response`                    | Tokenized with the provider's tokenizer (OpenAI `o200k_base` ~4.0 chars/tok, Claude BPE ~3.7 chars/tok, Gemini SentencePiece ~4.1 chars/tok).                |

## 3. EstimationService: hidden tokens + DTO

`services/estimation/estimation.service.ts` + `services/estimation/model-profiles.ts`.
Entry points: `estimateHiddenTokens(capture)`, `buildTokenEstimateDto(capture, visible, hidden)`.

| Count      | Source                             | How                                                                                     |
| ---------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `thinking` | `thinkingTimeMs`, `thinkingEffort` | `max(0, thinkingTimeMs − 250) × tokensPerMsThinking × effortMultiplier[thinkingEffort]` |
| `overhead` | model profile                      | `systemPromptTokens` of the provider/model (system prompt + tool definitions)           |

Unknown models fall back to the provider default and set `approximate: true`.
`buildTokenEstimateDto` sums `totalTokens = input + history + output + thinking + overhead`.

**Background only, not displayed:** the service also attaches an environmental `impact` from
`energy-lookup.json` (`energyWhPer1M`, `waterMlPer1M`, `co2GramsPer1M` per 1,000,000 tokens):

```
scale     = totalTokens / 1_000_000
energyWh  = scale × profile.energyWhPer1M
waterMl   = scale × profile.waterMlPer1M
co2Grams  = scale × profile.co2GramsPer1M
```

Assembles the final [`TokenEstimateDto`](dto.md#tokenestimatedto) containing `totalTokens`,
`breakdown`, `impact` (`energyWh`, `waterMl`, `co2Grams`), `provider`, `model`, and `timings`.

## 4. EstimationHandler: high-level orchestration

`handlers/estimation.handler.ts`

1. `normalizeCaptureDto(captureDto)` cleans the incoming capture data.
2. `countVisibleTokens(cleanedCapture)` (TokenizerService) counts input, history, output.
3. `estimateHiddenTokens(cleanedCapture)` (EstimationService) estimates thinking + overhead.
4. `buildTokenEstimateDto(cleanedCapture, visible, hidden)` sums `totalTokens` and builds the DTO.
5. `setLatestEstimate(tabId, estimateDto)` caches the DTO in `chrome.storage.session` for the popup.

## 5. Popup

When opened, `ui/popup/popup.view.ts` sends `GET_LATEST_ESTIMATE` for the active tab and shows
`totalTokens` and its breakdown. Nothing else.

## Open questions

- Tokenizer libraries for Anthropic/Google, and the bundle size budget.
- Where model profile numbers come from (published benchmarks, own measurements).
- Whether attachments (images, files) can be read and counted.
- Should `history` be capped by the model's context window?
