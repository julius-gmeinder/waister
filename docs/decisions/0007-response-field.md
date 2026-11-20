# 0007: Response as its own DTO field

**Status:** Accepted (2026-11-20)

## Context

The first spec was `{ userInput, chatHistory[], model, latencyMs }`, which left open where the
answer to the current prompt lives. Output tokens are usually the largest share and are counted
differently from re-sent context.

## Decision

`ChatCaptureDto` has a separate `response: string`. `chatHistory[]` holds only the turns
**before** the current `userInput`.

## Consequences

- input (`userInput`), context (`chatHistory`) and output (`response`) map directly to the
  `breakdown` fields.
- The estimation service gets the visible output length it needs for the thinking estimate.
