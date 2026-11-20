/**
 * EstimationHandler: high-level orchestrator in the background context.
 *
 * Receives a `ChatCaptureDto` from the content script strategy and delegates all domain logic
 * to the services:
 *   1. `normalizeCaptureDto`: cleans and validates incoming capture fields.
 *   2. `tokenizeCapture` (`tokenizer.service.ts`): tokenizes `userInput`, `response`, `chatHistory`
 *      and looks up `overhead` (system prompt) and `thinking` tokens (from `thinkingTimeMs`).
 *   3. `buildTokenEstimateDto` (`estimation.service.ts`): combines the tokenization result with
 *      the 1M-token energy/water lookup table (`energy-lookup.json`) to build `TokenEstimateDto`.
 *   4. `setLatestEstimate` (`estimate-cache.service.ts`): caches the resulting DTO for the popup.
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
import { buildTokenEstimateDto } from '../services/estimation/estimation.service';
import { tokenizeCapture } from '../services/tokenizer/tokenizer.service';

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
 * delegates to `tokenizer.service`, then `estimation.service`, and stores the result
 * in `estimate-cache.service` so the popup can display it.
 */
export async function handleEstimation(
  captureDto: ChatCaptureDto,
  tabId?: number,
): Promise<TokenEstimateDto> {
  // Step 1: Normalize the raw capture DTO
  const cleanedCapture = normalizeCaptureDto(captureDto);

  // Step 2: Delegate visible + hidden token counting to TokenizerService
  const tokenization = tokenizeCapture(cleanedCapture);

  // Step 3: Delegate environmental impact calculation & DTO assembly to EstimationService
  const estimateDto = buildTokenEstimateDto(cleanedCapture, tokenization);

  // Step 4: Cache the latest TokenEstimateDto per tab for the popup
  await setLatestEstimate(tabId, estimateDto);

  return estimateDto;
}

/**
 * High-level helper to retrieve the latest cached `TokenEstimateDto` for the popup.
 */
export async function handleGetLatestEstimate(tabId?: number): Promise<TokenEstimateDto | null> {
  return getLatestEstimate(tabId);
}
