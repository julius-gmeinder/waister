/**
 * SiteAdapter contract (layer 1, WHERE): DOM selectors, reads and state checks for one chat app.
 * No timing logic, that lives in `dom-capture.strategy.ts`.
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import type { ChatTurn, ModelInfo, Provider } from '../../dto/chat-capture.dto';

export interface SiteAdapter {
  readonly provider: Provider;

  /** `host` is `window.location.hostname`. */
  matches(host: string): boolean;

  readModel(): ModelInfo;

  readUserInput(): string;

  readResponse(): string;

  /** Turns before the latest prompt and its answer, oldest first. */
  readHistory(): ChatTurn[];

  /** A newly sent prompt raises the count. */
  countUserMessages(): number;

  /** A new response raises the count. */
  countResponses(): number;

  /** True while a response is being generated (e.g. stop button visible). */
  isGenerating(): boolean;

  /** True once the latest response shows visible text (thinking placeholders don't count). */
  isStreamingVisibleText(): boolean;

  /** True if `target` is (inside) the prompt composer. */
  isPromptInput(target: Element): boolean;

  /** True if `target` is (inside) the send button. */
  isSendButton(target: Element): boolean;

  /**
   * Optional per-turn thinking-time aggregator for sites with interleaved thinking (e.g. Claude).
   * When implemented, `dom-capture.strategy.ts` prefers this aggregated duration (initial +
   * mid-turn thinking phases) over `tStreamStart - t0`.
   */
  consumeThinkingTimeMs?(t0: number, tStreamStart: number, t1: number): number;
}
