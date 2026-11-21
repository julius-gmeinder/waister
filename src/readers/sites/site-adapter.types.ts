/**
 * SiteAdapter: contract of layer 1 (WHERE), the DOM selectors, reads and state checks for one chat
 * app. Timing and capture decisions live in `dom-capture.strategy.ts`, with one exception: an
 * adapter may keep state of its own where a site needs it (Claude's thinking-time aggregator, see
 * `isPromptInput`, `isSendButton`, `isGenerating`).
 *
 * Convention: a `// UNVERIFIED:` comment marks selectors that were derived from knowledge of the
 * site but never checked against the live page. Grep for it first when a site stops matching.
 *
 * Context: content
 * Docs: docs/modules.md#site-adapters
 */

import type {
  AttachmentKind,
  ChatTurn,
  ModelInfo,
  Provider,
  ToolCallKind,
} from '../../dto/chat-capture.dto';

export interface SiteAdapter {
  readonly provider: Provider;

  /** `host` is `window.location.hostname`. */
  matches(host: string): boolean;

  readModel(): ModelInfo;

  /** Markdown of the latest user message (see `domToMarkdown`). */
  readUserInput(): string;

  /** Images / files attached to the latest user message. */
  readUserAttachments(): AttachmentKind[];

  /**
   * Markdown of the latest answer, without UI chrome, thinking drawers, tool blocks and
   * artifact / canvas cards (those are counted separately).
   */
  readResponse(): string;

  /** Markdown of the artifact / canvas side panel written by the latest answer, '' if none. */
  readArtifactText(): string;

  /** Tool calls (web search, code execution, …) visible in the latest answer. */
  readToolCalls(): ToolCallKind[];

  /** Turns before the latest prompt and its answer, oldest first. */
  readHistory(): ChatTurn[];

  /** A newly sent prompt raises the count. */
  countUserMessages(): number;

  /** A new response raises the count. */
  countResponses(): number;

  /**
   * True while a response is being generated (e.g. stop button visible). Claude also feeds its
   * thinking aggregator on each call, so the strategy must keep polling it while a prompt is in flight.
   */
  isGenerating(): boolean;

  /** True once the latest response shows visible text (thinking placeholders don't count). */
  isStreamingVisibleText(): boolean;

  /** True if `target` is (inside) the prompt composer. Claude also starts a thinking-time turn on a hit. */
  isPromptInput(target: Element): boolean;

  /** True if `target` is (inside) the send button. Claude also starts a thinking-time turn on a hit. */
  isSendButton(target: Element): boolean;

  /**
   * Optional per-turn thinking-time aggregator for sites with interleaved thinking (e.g. Claude).
   * When implemented, `dom-capture.strategy.ts` prefers this aggregated duration (initial +
   * mid-turn thinking phases) over `tStreamStart - t0`.
   */
  consumeThinkingTimeMs?(t0: number, tStreamStart: number, t1: number): number;
}
