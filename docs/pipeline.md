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
SiteAdapter notifies dom-capture.strategy.ts
  │
  ▼
Strategy reads { model, userInput, response, chatHistory[] } from SiteAdapter
  │
  ▼
Builds ChatCaptureDto & sends ESTIMATE_PROMPT ──▶ message.handler.ts ──▶ handleEstimation(dto)
```

1. **Prompt sent (`t0`)**: The site adapter's DOM hook detects the user pressing Enter in the
   composer or clicking the Send button (with a fallback when `isGenerating()` turns true).
2. **Start of visible stream (`tStreamStart`)**: The site adapter's `MutationObserver` watches for
   the new assistant turn to render its first visible output characters (`isStreamingVisibleText()`).
3. **Response finished (`t1`)**: The site adapter waits until `isGenerating()` transitions from
   `true` to `false` and remains settled (300 ms debounce so multi-chunk streams finish completely).
   Only then does the site adapter invoke the strategy callback with `{ t0, tStreamStart, t1 }`.
4. **DTO consolidation**: `dom-capture.strategy.ts` computes both:
   - `thinkingTimeMs = tStreamStart − t0` (delta between prompt send and start of visible stream)
   - `latencyMs = t1 − t0` (total time from prompt send until response completion)
     and queries the site adapter for `model`, `userInput`, `response`, and `chatHistory[]` to
     build a [`ChatCaptureDto`](dto.md#chatcapturedto).
5. **Dispatch to `estimation.handler.ts`**: The strategy sends `ChatCaptureDto` via `chrome.runtime`
   message `ESTIMATE_PROMPT`, which `handlers/message.handler.ts` routes into
   `handleEstimation(captureDto, tabId)` in `handlers/estimation.handler.ts`.

## 2. TokenizerService: visible & hidden tokens

`services/tokenizer/tokenizer.service.ts` + `services/tokenizer/tokenizer-lookup.json`.

| Count      | Source                        | How it works & why sites differ                                                                                                                              |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `input`    | `userInput`                   | Tokenized with the provider's tokenizer (`openai`, `anthropic`, or `google`) plus `turnFramingTokens` (4–5 control tokens wrapping the user turn).           |
| `history`  | every turn in `chatHistory[]` | Chat apps re-send the whole conversation as context on every prompt. Each turn is tokenized with the provider's tokenizer plus `turnFramingTokens` per turn. |
| `output`   | `response`                    | Tokenized with the provider's tokenizer (OpenAI `o200k_base` ~4.0 chars/tok, Claude BPE ~3.7 chars/tok, Gemini SentencePiece ~4.1 chars/tok).                |
| `thinking` | `thinkingTimeMs`              | Looked up in `tokenizer-lookup.json`: `max(0, thinkingTimeMs − 250) × tokensPerMsThinking × effortMultiplier[thinkingEffort]`.                               |
| `overhead` | `tokenizer-lookup.json`       | Per-provider/model `systemPromptTokens` from `tokenizer-lookup.json`.                                                                                        |

## 3. EstimationService: environmental impact (1M-token lookup)

`services/estimation/estimation.service.ts` + `services/estimation/energy-lookup.json`.

Uses `totalTokens = input + history + output + thinking + overhead` together with `energy-lookup.json`
(which defines `energyWhPer1M`, `waterMlPer1M`, and `co2GramsPer1M` per 1,000,000 tokens for each
provider and model):

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
2. `tokenizeCapture(cleanedCapture)` computes the token breakdown and `totalTokens`.
3. `buildTokenEstimateDto(cleanedCapture, tokenization)` attaches the environmental impact from the 1M-token lookup table.
4. `setLatestEstimate(tabId, estimateDto)` caches the DTO in `chrome.storage.session` for the popup.

## 5. Popup

When opened, `ui/popup/popup.view.ts` sends `GET_LATEST_ESTIMATE` for the active tab and shows
`totalTokens`.

## Open questions

- Tokenizer libraries for Anthropic/Google, and the bundle size budget.
- Where model profile numbers come from (published benchmarks, own measurements).
- Whether attachments (images, files) can be read and counted.
- Should `history` be capped by the model's context window?
