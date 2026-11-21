# DTOs

Plain, structured-clone-safe data. Defined in `src/dto/`. The shapes below match the code.

## ChatCaptureDto

`src/dto/chat-capture.dto.ts`. Built by the capture strategy in the content script, consumed by the
EstimationHandler. One DTO per sent prompt.

| Field             | Type               | Description                                                                                  |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| `provider`        | `Provider`         | `'openai' \| 'anthropic' \| 'google'`                                                        |
| `model`           | `ModelInfo`        | Model as shown in the site's UI, see below                                                   |
| `userInput`       | `string`           | Reconstructed markdown of the prompt that was just sent                                      |
| `userAttachments` | `AttachmentKind[]` | Images / files attached to `userInput` (`'image' \| 'file'`)                                 |
| `response`        | `string`           | Reconstructed markdown of the answer to that prompt (UI chrome stripped)                     |
| `artifactText`    | `string`           | Markdown of the artifact / canvas side panel written by the answer (`''` if none)            |
| `toolCalls`       | `ToolCallKind[]`   | Tool calls visible in the answer (`'search' \| 'code' \| 'other'`)                           |
| `chatHistory`     | `ChatTurn[]`       | All **earlier** turns of the conversation, oldest first. Excludes `userInput` and `response` |
| `latencyMs`       | `number`           | ms from sending the prompt (t0) until the response finished (t1)                             |
| `thinkingTimeMs`  | `number`           | ms from sending the prompt (t0) until the visible response stream begins (`tStreamStart`)    |
| `capturedAt`      | `number`           | Epoch ms at t1 (metadata)                                                                    |
| `conversationUrl` | `string`           | Link to the conversation: `location.origin + location.pathname` at t1 (no query or hash)     |

### ModelInfo

| Field            | Type             | Description                                                       |
| ---------------- | ---------------- | ----------------------------------------------------------------- |
| `name`           | `string`         | Model family, e.g. `gpt`, `claude-sonnet`, `gemini-pro`           |
| `version`        | `string`         | Version label as far as it is visible, e.g. `5.5`, `2.5`          |
| `thinkingEffort` | `ThinkingEffort` | `'none' \| 'low' \| 'medium' \| 'high' \| 'unknown'` (normalized) |
| `rawLabel`       | `string`         | Unparsed text from the UI, for debugging and later re-parsing     |

### ChatTurn

| Field         | Type                    | Description                                     |
| ------------- | ----------------------- | ----------------------------------------------- |
| `role`        | `'user' \| 'assistant'` | Who wrote the turn                              |
| `text`        | `string`                | Reconstructed markdown text                     |
| `attachments` | `AttachmentKind[]?`     | User turns only (`'image' \| 'file'`), optional |

## TokenEstimateDto

`src/dto/token-estimate.dto.ts`. Built by the EstimationHandler + EstimationService, then saved
as a `PromptRecordDto`.

| Field         | Type                  | Description                                                                                                        |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `totalTokens` | `number`              | **The single token total:** sum of all breakdown fields (`input + history + output + thinking + tools + overhead`) |
| `breakdown`   | `TokenBreakdown`      | `{ input, history, output, thinking, tools, overhead }` (see [pipeline.md](pipeline.md#thinking-vs-overhead))      |
| `impact`      | `EnvironmentalImpact` | `{ energyWh, waterMl, co2Grams }` from `config/config.json`. Saved, but not shown in the popup                     |
| `provider`    | `Provider`            | Echoed from the capture                                                                                            |
| `model`       | `ModelInfo`           | Echoed from the capture                                                                                            |
| `timings`     | object                | `{ latencyMs, thinkingTimeMs }` echoed from the capture                                                            |
| `approximate` | `boolean`             | `true` if any part used an approximate tokenizer or a fallback model profile                                       |
| `capturedAt`  | `number`              | Echoed from the capture                                                                                            |

## PromptRecordDto

`src/dto/prompt-record.dto.ts`. Built by `createPromptRecord` in the PromptStoreService and
saved as one row of the SQLite `prompts` table. Response of `ESTIMATE_PROMPT`.

All fields of `TokenEstimateDto`, plus:

| Field             | Type     | Description                                       |
| ----------------- | -------- | ------------------------------------------------- |
| `id`              | `string` | Random UUID (`crypto.randomUUID()`), primary key  |
| `conversationUrl` | `string` | Link to the conversation, echoed from the capture |

No chat text (`userInput`, `response`, `chatHistory`) is saved.

## UsageSummaryDto

`src/dto/usage-summary.dto.ts`. Built by `getUsageSummary(sinceMs)` in the PromptStoreService,
shown by the popup. Response of `GET_USAGE_SUMMARY`.

| Field         | Type             | Description                                          |
| ------------- | ---------------- | ---------------------------------------------------- |
| `sinceMs`     | `number`         | Start of the window (epoch ms, inclusive)            |
| `promptCount` | `number`         | Number of saved prompts with `capturedAt >= sinceMs` |
| `totalTokens` | `number`         | Sum of their `totalTokens`                           |
| `breakdown`   | `TokenBreakdown` | Sum of each breakdown field                          |
