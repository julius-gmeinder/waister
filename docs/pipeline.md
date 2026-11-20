# Estimation pipeline

Goal: for every prompt the user sends in a supported chat app, produce **one number**, the
estimated total token usage of that prompt.

```
Reader ──ChatCaptureDto──▶ EstimationHandler ──▶ TokenizerService   (visible)
                                    │         └─▶ EstimationService  (hidden)
                                    ▼
                           TokenEstimateDto { totalTokens, breakdown }
```

## 1. Reader (content script)

`readers/chat.reader.ts`, with a site adapter and a reader strategy.

1. The strategy notices the user sent a prompt → **t0**.
2. The strategy notices the response finished streaming (`isGenerating()` turns false) → **t1**.
3. The reader asks the site adapter for `userInput`, `response`, `chatHistory[]` and `model`.
4. It builds a [`ChatCaptureDto`](dto.md#chatcapturedto) with `latencyMs = t1 − t0` and sends it
   as `ESTIMATE_PROMPT` to the background.

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
