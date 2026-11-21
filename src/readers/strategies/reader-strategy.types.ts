/**
 * ReaderStrategy contract (layer 2, WHEN): detects prompt send and response end, then builds a
 * `ChatCaptureDto` from the site adapter's reads.
 *
 * Context: content script
 * Docs: docs/modules.md#reader-strategies
 */

import type { ChatCaptureDto } from '../../dto/chat-capture.dto';
import type { SiteAdapter } from '../sites/site-adapter.types';

/** Epoch ms timestamps of one prompt/response cycle. */
export interface TurnTimings {
  /** Prompt sent. */
  t0: number;
  /** First visible response text appeared. */
  tStreamStart: number;
  /** Last change to the response before it settled. */
  t1: number;
}

export type OnCaptureReady = (capture: ChatCaptureDto) => void;

export interface ReaderStrategy {
  /** Starts watching the page and returns a cleanup function. */
  start(
    onCapture?: OnCaptureReady,
    host?: string,
    customAdapters?: readonly SiteAdapter[],
  ): () => void;
}
