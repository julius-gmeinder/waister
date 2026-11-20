/**
 * EstimationHandler: high-level orchestrator in the background context.
 *
 * Receives a `ChatCaptureDto` from the content script strategy and delegates all domain logic
 * to the services:
 *   1. `normalizeCaptureDto`: cleans incoming capture fields.
 *   2. `countVisibleTokens` (`tokenizer.service.ts`): visible input, history, output tokens.
 *   3. `estimateHiddenTokens` (`estimation.service.ts`): hidden thinking + overhead tokens.
 *   4. `buildTokenEstimateDto` (`estimation.service.ts`): sums `totalTokens` and builds the DTO.
 *   5. `createPromptRecord` + `savePromptRecord` (`prompt-store.service.ts`): gives the prompt a
 *      UUID and saves it to the SQLite database, where the popup reads it from.
 *
 * Context: background
 * Docs: docs/modules.md#handlers, docs/pipeline.md
 */

import type { ChatCaptureDto } from '../dto/chat-capture.dto';
import type { PromptRecordDto } from '../dto/prompt-record.dto';
import {
  createPromptRecord,
  savePromptRecord,
} from '../services/prompt-store/prompt-store.service';
import {
  buildTokenEstimateDto,
  estimateHiddenTokens,
} from '../services/estimation/estimation.service';
import { countVisibleTokens } from '../services/tokenizer/tokenizer.service';

/**
 * Cleans and normalizes the incoming `ChatCaptureDto` before passing it to the services.
 */
export function normalizeCaptureDto(captureDto: ChatCaptureDto): ChatCaptureDto {
  return {
    provider: captureDto.provider,
    model: {
      name: captureDto.model.name,
      version: captureDto.model.version,
      thinkingEffort: captureDto.model.thinkingEffort,
      rawLabel: captureDto.model.rawLabel,
    },
    userInput: captureDto.userInput.trim(),
    response: captureDto.response.trim(),
    chatHistory: captureDto.chatHistory.map((turn) => ({
      role: turn.role,
      text: turn.text.trim(),
    })),
    latencyMs: Math.max(0, captureDto.latencyMs),
    thinkingTimeMs: Math.max(0, captureDto.thinkingTimeMs),
    capturedAt: captureDto.capturedAt,
    conversationUrl: captureDto.conversationUrl,
  };
}

/**
 * High-level orchestration for estimating a captured prompt:
 * visible tokens from `tokenizer.service`, hidden tokens from `estimation.service`, then saves the
 * prompt via `prompt-store.service`.
 */
export async function handleEstimation(captureDto: ChatCaptureDto): Promise<PromptRecordDto> {
  // Step 1: Normalize the raw capture DTO
  const cleanedCapture = normalizeCaptureDto(captureDto);

  // Step 2: Visible tokens (input, history, output) via TokenizerService
  const visible = countVisibleTokens(cleanedCapture);

  // Step 3: Hidden tokens (thinking, overhead) via EstimationService
  const hidden = estimateHiddenTokens(cleanedCapture);

  // Step 4: Sum into totalTokens and assemble the DTO
  const estimateDto = buildTokenEstimateDto(cleanedCapture, visible, hidden);

  // Step 5: Save the prompt (with a new UUID and the conversation link) to the database
  const record = createPromptRecord(cleanedCapture, estimateDto);
  await savePromptRecord(record);

  return record;
}
