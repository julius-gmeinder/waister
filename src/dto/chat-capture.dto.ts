/**
 * ChatCaptureDto (reader -> EstimationHandler) and its parts. Must stay structured-clone-safe.
 *
 * Context: shared (any context)
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

export type Provider = 'openai' | 'anthropic' | 'google';

export type ThinkingEffort = 'none' | 'low' | 'medium' | 'high' | 'unknown';

/** Fields the site's UI doesn't show are 'unknown'. */
export interface ModelInfo {
  /** Model family, e.g. 'gpt', 'claude-sonnet', 'gemini-pro'. */
  name: string;
  /** e.g. '4o', '4.5', '2.5', or 'unknown'. */
  version: string;
  thinkingEffort: ThinkingEffort;
  /** Unparsed label from the DOM, for debugging. */
  rawLabel: string;
}

/** Something attached to a user turn: an image, or a file / pasted-content card. */
export type AttachmentKind = 'image' | 'file';

/** A tool the model called while answering (its inputs/results are hidden tokens). */
export type ToolCallKind = 'search' | 'code' | 'other';

/** An earlier turn, before the newly sent prompt. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  /** Markdown reconstructed from the rendered message. */
  text: string;
  /** User turns only. Omitted when empty. */
  attachments?: AttachmentKind[];
}

/** Captured once the response has finished streaming (t1). */
export interface ChatCaptureDto {
  provider: Provider;
  model: ModelInfo;
  /** Markdown of the prompt that was just sent. */
  userInput: string;
  /** Images / files attached to `userInput`. */
  userAttachments: AttachmentKind[];
  /** Markdown reconstructed from the rendered answer (UI chrome stripped). */
  response: string;
  /** Artifact / canvas document written by the answer (side panel), '' if none. Counts as output. */
  artifactText: string;
  /** Tool calls visible in the answer (web search, code execution, …). */
  toolCalls: ToolCallKind[];
  /** Earlier turns, oldest first. Excludes `userInput` and `response`. */
  chatHistory: ChatTurn[];
  /** ms from send (t0) until streaming finished (t1). */
  latencyMs: number;
  /** ms from send (t0) until visible text starts streaming. Basis for the thinking estimate. */
  thinkingTimeMs: number;
  /** Epoch ms at t1. */
  capturedAt: number;
  /**
   * Origin + path (no query or hash), read at t1 so a new chat already has its final URL
   * (e.g. `https://claude.ai/chat/<id>`).
   */
  conversationUrl: string;
}
