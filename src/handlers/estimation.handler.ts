/**
 * EstimationHandler: high-level orchestrator in the background context.
 *
 * Receives a `ChatCaptureDto` from the content script strategy and delegates all domain logic
 * to the services:
 *   1. `normalizeCaptureDto`: cleans incoming capture fields.
 *   2. `countVisibleTokens` (`tokenizer.service.ts`): visible input, history, output tokens.
 *   3. `estimateHiddenTokens` (`estimation.service.ts`): hidden thinking + overhead tokens.
 *   4. `buildTokenEstimateDto` (`estimation.service.ts`): sums `totalTokens` and builds the DTO.
 *   5. `setLatestEstimate` (`estimate-cache.service.ts`): caches the resulting DTO for the popup.
 *
 * Context: background
 * Docs: docs/modules.md#handlers, docs/pipeline.md
 */

import type { ChatCaptureDto } from '../dto/chat-capture.dto';
import type { TokenEstimateDto } from '../dto/token-estimate.dto';
import {
  getLatestEstimate,
  setLatestEstimate,
} from '../services/estimate-cache/estimate-cache.service';
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
  };
}

/**
 * High-level orchestration for estimating a captured prompt:
 * visible tokens from `tokenizer.service`, hidden tokens from `estimation.service`, then stores the result
 * in `estimate-cache.service` so the popup can display it.
 */
export async function handleEstimation(
  captureDto: ChatCaptureDto,
  tabId?: number,
): Promise<TokenEstimateDto> {
  // Step 1: Normalize the raw capture DTO
  const cleanedCapture = normalizeCaptureDto(captureDto);

  // Step 2: Visible tokens (input, history, output) via TokenizerService
  const visible = countVisibleTokens(cleanedCapture);

  // Step 3: Hidden tokens (thinking, overhead) via EstimationService
  const hidden = estimateHiddenTokens(cleanedCapture);

  // Step 4: Sum into totalTokens and assemble the DTO
  const estimateDto = buildTokenEstimateDto(cleanedCapture, visible, hidden);

  // Step 5: Cache the latest TokenEstimateDto per tab for the popup
  await setLatestEstimate(tabId, estimateDto);

  return estimateDto;
}

/**
 * High-level helper to retrieve the latest cached `TokenEstimateDto` for the popup.
 */
export async function handleGetLatestEstimate(tabId?: number): Promise<TokenEstimateDto | null> {
  return getLatestEstimate(tabId);
}
