/**
 * ChatCaptureDto: Reader -> EstimationHandler. Also ChatTurn, ModelInfo, Provider, ThinkingEffort.
 *
 * Represents the consolidated capture of a single prompt/response cycle from a supported LLM chat
 * site (ChatGPT, Claude, Gemini). Must remain plain, structured-clone-safe data so it can cross
 * the content-script -> background service-worker boundary via chrome.runtime.sendMessage.
 *
 * Context: shared (any context)
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

/** Supported LLM provider identifiers corresponding to each chat site. */
export type Provider = 'openai' | 'anthropic' | 'google';

/** Normalized reasoning/thinking effort level detected from the site's UI. */
export type ThinkingEffort = 'none' | 'low' | 'medium' | 'high' | 'unknown';

/**
 * Model metadata extracted from the chat site's model selector / UI controls.
 * If the UI does not expose version or thinking effort, defaults to 'unknown'.
 */
export interface ModelInfo {
  /** Model family identifier, e.g. 'gpt', 'claude-sonnet', 'gemini-pro'. */
  name: string;
  /** Visible model version string, e.g. '4o', '4.5', '2.5', or 'unknown'. */
  version: string;
  /** Normalized thinking/reasoning effort inferred from the active model or toggle. */
  thinkingEffort: ThinkingEffort;
  /** Unparsed label directly read from the DOM for debugging or downstream re-parsing. */
  rawLabel: string;
}

/** A single earlier turn in the conversation history (prior to the newly sent prompt). */
export interface ChatTurn {
  /** Author of the conversation turn. */
  role: 'user' | 'assistant';
  /** Visible plain text of the turn. */
  text: string;
}

/**
 * Consolidated payload captured after an assistant response finishes streaming (at t1).
 * Sent from the content script strategy to the EstimationHandler in the background worker.
 */
export interface ChatCaptureDto {
  /** LLM provider hosting the chat application. */
  provider: Provider;
  /** Detected model name, version, thinking effort, and raw UI label. */
  model: ModelInfo;
  /** Visible text of the user prompt that triggered this generation. */
  userInput: string;
  /** Visible text of the completed assistant response. */
  response: string;
  /** All earlier turns of the conversation in chronological order (excludes userInput & response). */
  chatHistory: ChatTurn[];
  /** Total elapsed time in ms from prompt send (t0) until response stream completion (t1). */
  latencyMs: number;
  /**
   * Elapsed time in ms from prompt send (t0) until the visible response stream begins (tStreamStart).
   * Used to estimate hidden reasoning/thinking time before visible tokens start appearing.
   */
  thinkingTimeMs: number;
  /** Epoch timestamp (Date.now()) recorded when the response finished at t1. */
  capturedAt: number;
  /**
   * Link to the conversation on the chat site (origin + path, no query or hash), read at t1 so a
   * new chat already has its final URL (e.g. `https://claude.ai/chat/<id>`).
   */
  conversationUrl: string;
}
