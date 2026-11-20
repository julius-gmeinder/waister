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

## 2. TokenizerService: visible tokens

`services/tokenizer/`, picked per `provider`.

| Count     | Text                          | Why it counts                                                                            |
| --------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `input`   | `userInput`                   | The new prompt                                                                           |
| `history` | every turn in `chatHistory[]` | Chat apps re-send the whole conversation as context on every prompt, so it's input again |
| `output`  | `response`                    | The visible answer                                                                       |

## 3. EstimationService: hidden tokens

`services/estimation/`, using `model` (name, version, thinking effort), `latencyMs` and the
visible counts.

| Count      | Source                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| `thinking` | Time not explained by visible output, converted at the model's output speed |
| `overhead` | Per-model constant: system prompt, tool definitions                         |

Formula sketch (to be refined when implementing):

```
generationMs   = latencyMs − profile.timeToFirstTokenMs
visibleOutMs   = output / profile.outputTokensPerSecond × 1000
thinking       = max(0, generationMs − visibleOutMs) / 1000 × profile.outputTokensPerSecond
                 × profile.effortFactor[thinkingEffort]
overhead       = profile.systemPromptTokens
```

Known error sources: network latency, server queueing, rate limiting, and models that stream
thinking summaries into the page. A missing model profile falls back to the provider default
and is flagged in the result.

## 4. EstimationHandler: the single number

`handlers/estimation.handler.ts`

```
totalTokens = input + history + output + thinking + overhead
```

It returns a [`TokenEstimateDto`](dto.md#tokenestimatedto), stores it with the
EstimateCacheService under the sender's tab id, and replies to the content script.

## 5. Popup

When opened, `ui/popup/popup.view.ts` sends `GET_LATEST_ESTIMATE` for the active tab and shows
`totalTokens`.

## Open questions

- Tokenizer libraries for Anthropic/Google, and the bundle size budget.
- Where model profile numbers come from (published benchmarks, own measurements).
- Whether attachments (images, files) can be read and counted.
- Should `history` be capped by the model's context window?
