/**
 * SiteAdapter contract (layer 1, WHERE).
 *
 * A SiteAdapter is strictly responsible for hooking into a specific chat web app's DOM
 * (selectors, element queries, and send/generation hooks). Once a prompt is sent (t0),
 * the site adapter monitors the DOM for when the visible stream begins (tStreamStart) and
 * when the response is completely finished (t1), then notifies the strategy so the strategy
 * can consolidate all site data into a ChatCaptureDto.
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import type { ChatTurn, ModelInfo, Provider } from '../../dto/chat-capture.dto';

/**
 * Raw timing markers captured by the site's DOM hooks for a single prompt-response cycle.
 */
export interface SiteTurnTimings {
  /** Epoch ms when the user submitted the prompt (t0). */
  t0: number;
  /** Epoch ms when the first visible response tokens started streaming into the DOM (tStreamStart). */
  tStreamStart: number;
  /** Epoch ms when the response stream finished completely (t1). */
  t1: number;
}

/**
 * Callback invoked by a SiteAdapter only after the response stream has completely finished (at t1).
 */
export type OnTurnCompleted = (timings: SiteTurnTimings) => void;

/**
 * Contract implemented by each supported chat platform (ChatGPT, Claude, Gemini).
 * Isolates all site-specific DOM selectors and hooking points from the consolidation strategy.
 */
export interface SiteAdapter {
  /** Provider identifier for this site ('openai' | 'anthropic' | 'google'). */
  readonly provider: Provider;

  /** Returns true if this adapter handles the given window.location.hostname. */
  matches(host: string): boolean;

  /** Returns the main conversation root element in the DOM (or document.body as fallback). */
  getChatContainer(): Element;

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

  /**
   * Returns true while the site is actively generating/streaming an assistant response
   * (e.g., stop button visible, streaming attribute active).
   */
  isGenerating(): boolean;

  /**
   * Returns true while the site is in a pre-stream "thinking/reasoning" phase or before
   * visible assistant output text has started appearing.
   */
  isStreamingVisibleText(): boolean;

  /**
   * Hooks into the site's DOM (send button, prompt input Enter key, and conversation container).
   * Waits until the response is fully generated (stream done at t1) before invoking `onCompleted`
   * with `{ t0, tStreamStart, t1 }`. Returns an cleanup function to disconnect hooks.
   */
  observeTurnCompletion(onCompleted: OnTurnCompleted): () => void;
}
