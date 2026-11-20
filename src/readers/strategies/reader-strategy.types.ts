/**
 * ReaderStrategy contract (layer 2, WHEN/HOW & consolidation).
 *
 * Defines the contract for a capture strategy (such as `dom-capture.strategy.ts`) that detects
 * when a prompt was sent and when its response finished, computes timing deltas
 * (`latencyMs = t1 - t0` and `thinkingTimeMs = tStreamStart - t0`), and builds a `ChatCaptureDto`
 * from the matching site adapter's reads.
 *
 * Context: content script
 * Docs: docs/modules.md#reader-strategies
 */

import type { ChatCaptureDto } from '../../dto/chat-capture.dto';
import type { SiteAdapter } from '../sites/site-adapter.types';

/**
 * Timing markers for a single prompt-response cycle, detected by the strategy.
 */
export interface TurnTimings {
  /** Epoch ms when the user submitted the prompt (t0). */
  t0: number;
  /** Epoch ms when the first visible response tokens appeared in the DOM (tStreamStart). */
  tStreamStart: number;
  /** Epoch ms of the last change to the response before it settled (t1). */
  t1: number;
}

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
   * starts watching the page, and calls `onCapture` with the consolidated
   * `ChatCaptureDto` once a response finishes streaming.
   */
  start(
    onCapture?: OnCaptureReady,
    host?: string,
    customAdapters?: readonly SiteAdapter[],
  ): () => void;
}
