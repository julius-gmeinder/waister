# DTOs

Plain, structured-clone-safe data. Defined in `src/dto/`. The shapes below match the code.

## ChatCaptureDto

`src/dto/chat-capture.dto.ts`. Built by the reader in the content script, consumed by the
EstimationHandler. One DTO per sent prompt.

| Field            | Type         | Description                                                                                  |
| ---------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `provider`       | `Provider`   | `'openai' \| 'anthropic' \| 'google'`                                                        |
| `model`          | `ModelInfo`  | Model as shown in the site's UI, see below                                                   |
| `userInput`      | `string`     | Text of the prompt that was just sent                                                        |
| `response`       | `string`     | Visible text of the answer to that prompt                                                    |
| `chatHistory`    | `ChatTurn[]` | All **earlier** turns of the conversation, oldest first. Excludes `userInput` and `response` |
| `latencyMs`      | `number`     | ms from sending the prompt (t0) until the response finished (t1)                             |
| `thinkingTimeMs` | `number`     | ms from sending the prompt (t0) until the visible response stream begins (`tStreamStart`)    |
| `capturedAt`     | `number`     | Epoch ms at t1 (metadata)                                                                    |

### ModelInfo

| Field            | Type             | Description                                                       |
| ---------------- | ---------------- | ----------------------------------------------------------------- |
| `name`           | `string`         | Model family, e.g. `gpt`, `claude-sonnet`, `gemini-pro`           |
| `version`        | `string`         | Version label as far as it is visible, e.g. `5.5`, `2.5`          |
| `thinkingEffort` | `ThinkingEffort` | `'none' \| 'low' \| 'medium' \| 'high' \| 'unknown'` (normalized) |
| `rawLabel`       | `string`         | Unparsed text from the UI, for debugging and later re-parsing     |

### ChatTurn

| Field  | Type                    | Description        |
| ------ | ----------------------- | ------------------ |
| `role` | `'user' \| 'assistant'` | Who wrote the turn |
| `text` | `string`                | Visible text       |

## TokenEstimateDto

`src/dto/token-estimate.dto.ts`. Built by the EstimationHandler + EstimationService, cached per
tab, shown by the popup.

| Field         | Type                  | Description                                                                                                |
| ------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `totalTokens` | `number`              | **The single token total:** sum of all breakdown fields (`input + history + output + thinking + overhead`) |
| `breakdown`   | `TokenBreakdown`      | `{ input, history, output, thinking, overhead }` (see [pipeline.md](pipeline.md))                          |
| `impact`      | `EnvironmentalImpact` | `{ energyWh, waterMl, co2Grams }` from `energy-lookup.json`. Background only, not shown in the popup       |
| `provider`    | `Provider`            | Echoed from the capture                                                                                    |
| `model`       | `ModelInfo`           | Echoed from the capture                                                                                    |
| `timings`     | object                | `{ latencyMs, thinkingTimeMs }` echoed from the capture                                                    |
| `approximate` | `boolean`             | `true` if any part used an approximate tokenizer or a fallback model profile                               |
| `capturedAt`  | `number`              | Echoed from the capture                                                                                    |
