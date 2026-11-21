/**
 * ReaderStrategyTypes: timing and callback types of the DOM capture strategy (layer 2, WHEN).
 *
 * Context: content
 * Docs: docs/modules.md#reader-strategies
 */

import type { ChatCaptureDto } from '../../dto/chat-capture.dto';

/** Epoch ms timestamps of one prompt/response cycle. */
export interface TurnTimings {
  /** Prompt sent. */
  t0: number;
  /** First visible response text appeared. */
  tStreamStart: number;
  /** Last activity before the response settled: last text change or generating indicator seen. */
  t1: number;
}

export type OnCaptureReady = (capture: ChatCaptureDto) => void;
