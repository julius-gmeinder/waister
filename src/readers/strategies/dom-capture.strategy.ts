/**
 * Consolidated DOM Capture Strategy (`dom-capture.strategy.ts`).
 *
 * Consolidates all supported site adapters (`chatgpt.site.ts`, `claude.site.ts`, `gemini.site.ts`).
 * While the site adapters only handle DOM hooking and wait until a response stream is completely
 * finished, this strategy combines their logic:
 *   1. Selects the active SiteAdapter for the current host.
 *   2. Receives raw timing markers `{ t0, tStreamStart, t1 }` from the site adapter only once
 *      the response has completely finished streaming.
 *   3. Calculates both:
 *      - `thinkingTimeMs = Math.max(0, tStreamStart - t0)` (delta between user send and start of stream)
 *      - `latencyMs = Math.max(0, t1 - t0)` (total time from user send until stream completion)
 *   4. Reads the completed DOM texts (`userInput`, `response`, `chatHistory`, `model`) from the site
 *      adapter and consolidates them into a `ChatCaptureDto`.
 *   5. Forwards the consolidated `ChatCaptureDto` via `ESTIMATE_PROMPT` so it is parsed into
 *      the `handleEstimation` method in `src/handlers/estimation.handler.ts`.
 *
 * Context: content script
 * Docs: docs/modules.md#reader-strategies, docs/pipeline.md
 */

import type { ChatCaptureDto } from '../../dto/chat-capture.dto';
import type { EstimatePromptMessage } from '../../messages/runtime-messages';
import { chatgptSite } from '../sites/chatgpt.site';
import { claudeSite } from '../sites/claude.site';
import { geminiSite } from '../sites/gemini.site';
import type { SiteAdapter, SiteTurnTimings } from '../sites/site-adapter.types';
import type { OnCaptureReady, ReaderStrategy } from './reader-strategy.types';

/**
 * Registry of all supported site adapters consolidated by this strategy.
 */
export const SUPPORTED_SITES: readonly SiteAdapter[] = [chatgptSite, claudeSite, geminiSite];

/**
 * Finds the site adapter matching the current hostname (e.g. `chatgpt.com`, `claude.ai`, `gemini.google.com`).
 */
export function resolveSiteAdapter(
  host: string = window.location.hostname,
  adapters: readonly SiteAdapter[] = SUPPORTED_SITES,
): SiteAdapter | null {
  return adapters.find((adapter) => adapter.matches(host)) ?? null;
}

/**
 * Consolidates the site adapter's DOM reads and timing markers (`t0`, `tStreamStart`, `t1`)
 * into a structured-clone-safe `ChatCaptureDto` once the response stream has finished.
 */
export function buildChatCaptureDto(
  adapter: SiteAdapter,
  timings: SiteTurnTimings,
): ChatCaptureDto {
  // Delta between t(0) (user sent prompt) and start of visible stream -> thinking time
  const thinkingTimeMs = Math.max(0, timings.tStreamStart - timings.t0);
  // Delta between t(0) (user sent prompt) and t(1) (response stream finished) -> total latency
  const latencyMs = Math.max(0, timings.t1 - timings.t0);

  return {
    provider: adapter.provider,
    model: adapter.readModel(),
    userInput: adapter.readUserInput(),
    response: adapter.readResponse(),
    chatHistory: adapter.readHistory(),
    latencyMs,
    thinkingTimeMs,
    capturedAt: timings.t1,
  };
}

/**
 * Sends the consolidated `ChatCaptureDto` across the MV3 runtime boundary (`ESTIMATE_PROMPT`)
 * so that `message.handler.ts` routes it directly into `handleEstimation` in `estimation.handler.ts`.
 */
export function dispatchCaptureToEstimationHandler(dto: ChatCaptureDto): void {
  const message: EstimatePromptMessage = {
    type: 'ESTIMATE_PROMPT',
    payload: dto,
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Background worker may not be listening during unit tests or extension reloads.
  });
}

/**
 * Starts the consolidated DOM capture strategy on the current page.
 * Hooks the matching site adapter, waits for response completion (t1), consolidates
 * the site inputs into a `ChatCaptureDto`, and dispatches it to `estimation.handler.ts`.
 */
export function startDomCaptureStrategy(
  onCapture: OnCaptureReady = dispatchCaptureToEstimationHandler,
  host: string = window.location.hostname,
  adapters: readonly SiteAdapter[] = SUPPORTED_SITES,
): () => void {
  const adapter = resolveSiteAdapter(host, adapters);
  if (!adapter) {
    return () => {};
  }

  // The site adapter waits until the response stream is completely done before calling back
  return adapter.observeTurnCompletion((timings: SiteTurnTimings) => {
    const dto = buildChatCaptureDto(adapter, timings);
    // Only dispatch when we have a non-empty response after stream completion
    if (!dto.response && !dto.userInput) {
      return;
    }
    onCapture(dto);
  });
}

/**
 * Object facade implementing `ReaderStrategy` for consumers that expect the strategy contract.
 */
export const domCaptureStrategy: ReaderStrategy = {
  start: startDomCaptureStrategy,
};
