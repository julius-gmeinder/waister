/**
 * EstimationHandler: receives the consolidated `ChatCaptureDto` produced by
 * `dom-capture.strategy.ts` once a response stream finishes on ChatGPT, Claude, or Gemini.
 *
 * NOTE: Per user instructions, implementation stops at receiving and parsing the consolidated
 * `ChatCaptureDto` in `handleEstimation`. Downstream tokenization and environmental/token
 * estimation services will be wired in the next phase.
 *
 * Context: background
 * Docs: docs/modules.md#handlers, docs/pipeline.md
 */

import type { ChatCaptureDto } from '../dto/chat-capture.dto';

/**
 * Entry point in the background layer for handling a captured prompt/response cycle.
 * Receives the consolidated `ChatCaptureDto` from the content script strategy.
 *
 * @param captureDto Consolidated data captured from the chat site's DOM at stream completion (t1).
 * @param tabId Optional browser tab ID of the sender tab for session caching.
 */
export async function handleEstimation(
  captureDto: ChatCaptureDto,
  tabId?: number,
): Promise<ChatCaptureDto> {
  // Validate and normalize incoming DTO fields from the content script strategy
  const normalizedCapture: ChatCaptureDto = {
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

  // Stop point per instructions: DTO is consolidated and parsed into handleEstimation.
  void tabId;
  return normalizedCapture;
}
