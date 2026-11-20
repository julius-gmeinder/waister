/**
 * ReaderStrategy contract (layer 2, WHEN/HOW & consolidation).
 *
 * Defines the contract for a capture strategy (such as `dom-capture.strategy.ts`) that
 * consolidates all supported site adapters, computes timing deltas (`latencyMs = t1 - t0`
 * and `thinkingTimeMs = tStreamStart - t0`), and builds a `ChatCaptureDto`.
 *
 * Context: content script
 * Docs: docs/modules.md#reader-strategies
 */

import type { ChatCaptureDto } from '../../dto/chat-capture.dto';
import type { SiteAdapter } from '../sites/site-adapter.types';

/**
 * Callback invoked by a capture strategy whenever a complete prompt/response cycle
 * has finished streaming and has been consolidated into a ChatCaptureDto.
 */
export type OnCaptureReady = (capture: ChatCaptureDto) => void;

/**
 * Contract for a strategy that connects site adapters to the capture pipeline.
 */
export interface ReaderStrategy {
  /**
   * Resolves the matching site adapter for `host` (or uses the provided adapter),
   * attaches the turn-completion hook, and calls `onCapture` with the consolidated
   * `ChatCaptureDto` once a response finishes streaming.
   */
  start(
    onCapture?: OnCaptureReady,
    host?: string,
    customAdapters?: readonly SiteAdapter[],
  ): () => void;
}
