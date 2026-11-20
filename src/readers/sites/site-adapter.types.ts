/**
 * SiteAdapter contract (layer 1, WHERE).
 *
 * A SiteAdapter only knows one chat web app's DOM: selectors, plain reads and state checks
 * (is a response streaming, how many responses are on the page, is this element the composer or
 * the send button). It holds no timing logic. Detecting when a prompt was sent and when its
 * response finished is the job of the strategy (`dom-capture.strategy.ts`).
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import type { ChatTurn, ModelInfo, Provider } from '../../dto/chat-capture.dto';

/**
 * Contract implemented by each supported chat platform (ChatGPT, Claude, Gemini).
 * Isolates all site-specific DOM selectors from the strategy.
 */
export interface SiteAdapter {
  /** Provider identifier for this site ('openai' | 'anthropic' | 'google'). */
  readonly provider: Provider;

  /** Returns true if this adapter handles the given window.location.hostname. */
  matches(host: string): boolean;

  /** Reads the currently selected model metadata from the site's UI header/dropdown. */
  readModel(): ModelInfo;

  /** Reads the text of the latest user prompt from the DOM. */
  readUserInput(): string;

  /** Reads the text of the latest assistant response from the DOM. */
  readResponse(): string;

  /**
   * Reads all earlier turns in the conversation prior to the latest user prompt and response.
   * Ordered oldest-first.
   */
  readHistory(): ChatTurn[];

  /** Number of assistant responses currently in the DOM. A new response raises the count. */
  countResponses(): number;

  /**
   * Returns true while the site is actively generating/streaming an assistant response
   * (e.g., stop button visible, streaming attribute active).
   */
  isGenerating(): boolean;

  /** Returns true once the latest assistant response shows visible output text. */
  isStreamingVisibleText(): boolean;

  /** Returns true if `target` is (inside) the prompt composer. */
  isPromptInput(target: Element): boolean;

  /** Returns true if `target` is (inside) the send button. */
  isSendButton(target: Element): boolean;
}
