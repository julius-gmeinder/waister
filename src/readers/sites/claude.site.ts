/**
 * Claude SiteAdapter (claude.ai): selectors and reads for one chat app, plus an internal
 * thinking-time aggregator for interleaved thinking (Claude thinks, writes, pauses to think or use
 * tools again, then resumes).
 * Claude has no stable turn tags: messages are found by `data-testid` and font utility classes
 * (`.font-user-message`, `.font-claude-message`), and a message can match several of them at once,
 * so turn lookups always take the outermost match.
 *
 * Unlike the other adapters this one has side effects, intentionally (see `SiteAdapter`):
 * `isPromptInput` / `isSendButton` call `startTurn()` and `isGenerating` calls `tick()` to feed the
 * aggregator, which `consumeThinkingTimeMs` reads out once per prompt.
 *
 * Context: content
 * Docs: docs/modules.md#site-adapters
 */

import { capture } from '../../config/config.json';
import type { AttachmentKind, ChatTurn, ModelInfo, ToolCallKind } from '../../dto/chat-capture.dto';
import {
  domToMarkdown,
  readArtifactText,
  readAttachments,
  readToolCalls,
  type ToolSelectors,
} from '../dom-content.reader';
import type { SiteAdapter } from './site-adapter.types';
import {
  buildHistory,
  buildModelInfo,
  hasMatch,
  joinSelectors,
  latestOf,
  makeTurn,
  matchesOrContains,
  queryOutermost,
  readText,
  readTurnNodes,
  rootsOf,
  toolBlockSelector,
  unknownModel,
} from './site.helpers';

const CLAUDE_SELECTORS = {
  promptInput: 'div.ProseMirror[contenteditable="true"], [data-testid="chat-input"]',
  /**
   * `*="Send"` also covers "Send Message" / "Send message". The `fieldset` fallback is broad
   * (last button of the composer fieldset) and can hit other composer buttons, which would start
   * a turn without a prompt being sent.
   */
  sendButton: 'button[aria-label*="Send"], fieldset button[type="button"]:last-of-type',
  /** `*="Stop"` also covers "Stop Response" / "Stop generating". */
  stopButton: 'button[aria-label*="Stop"]',
  streamingContainer: '[data-is-streaming="true"]',
  userMessage: '[data-testid="user-message"], .font-user-message',
  assistantMessage:
    '.font-claude-message, .font-claude-response, [data-testid="assistant-message"]',
  modelSelector: '[data-testid="model-selector-dropdown"], button[aria-label*="Model"]',
  /** Composer toggle. Page state, not part of any turn. */
  thinkingToggle: 'button[aria-label*="Extended thinking"]',
  /** Thinking markers inside an answer. Checked in the latest turn only. */
  thinkingIndicator: '[data-testid*="thinking"], [aria-expanded][class*="thinking"]',
  /** Collapsible thinking/thought blocks inside an assistant turn that must not count as visible answer text. */
  thinkingBlock:
    '[data-testid*="thinking"], [data-testid*="thought"], [aria-expanded][class*="thinking"], details[class*="thinking"], [class*="thinking-block"]',
  /**
   * Wrapper of one message, holding a user turn's attachment cards next to its text. This is a
   * React dev attribute (render counter), not a semantic one, so it may disappear. Attachments
   * then fall back to the parent of the message node.
   */
  turnContainer: '[data-test-render-count]',
  // UNVERIFIED: the selectors below were not checked on the live site.
  /** File / image / pasted-content cards in a user turn. */
  attachmentTile: '[data-testid="file-thumbnail"], [data-testid*="attachment"]',
  /** Artifact card inside the answer. */
  artifactCard: '[data-testid*="artifact"], .artifact-block-cell',
  /** Artifact side panel with the document / code. */
  artifactPanel:
    '#markdown-artifact, [data-testid="artifact-content"], [data-testid*="artifact-view"]',
} as const;

// UNVERIFIED: all tool selectors.
const CLAUDE_TOOLS: ToolSelectors = {
  search: '[data-testid*="search"]',
  code: '[data-testid*="analysis"], [data-testid*="repl"]',
  other: '[data-testid*="tool-use"]:not([data-testid*="search"])',
  searchEvidence: '[data-testid*="citation"], a[data-citation]',
};

/** Not model output: thinking drawers, tool blocks and artifact cards (counted separately). */
const CLAUDE_MESSAGE_CHROME = joinSelectors(
  CLAUDE_SELECTORS.thinkingBlock,
  toolBlockSelector(CLAUDE_TOOLS),
  CLAUDE_SELECTORS.artifactCard,
);

/** User and assistant turns in document order. */
const CLAUDE_ALL_TURNS = joinSelectors(
  CLAUDE_SELECTORS.userMessage,
  CLAUDE_SELECTORS.assistantMessage,
);

/**
 * Pause (ms) in visible response text while Claude is still generating after which we infer an
 * interleaved thinking phase.
 */
const INTERLEAVED_STALL_MS = capture.timings.claudeInterleavedStallMs;

function readUserText(userEl: Element | undefined): string {
  return domToMarkdown(userEl, { preserveLineBreaks: true });
}

/**
 * Markdown of a Claude response without thinking blocks, tool blocks and artifact cards, so
 * thinking summaries don't trigger `isStreamingVisibleText()` early or mask interleaved pauses.
 * Thinking blocks are only skipped *inside* the message: an ancestor check (`closest`) also
 * matched wrappers around the whole answer, so the response read as '' and no prompt ever
 * finished capturing.
 */
function readResponseText(assistantEl: Element | undefined): string {
  return domToMarkdown(assistantEl, { skip: CLAUDE_MESSAGE_CHROME });
}

function readTurnAttachments(userEl: Element | undefined): AttachmentKind[] {
  if (!userEl) return [];
  const container =
    userEl.closest(CLAUDE_SELECTORS.turnContainer) ?? userEl.parentElement ?? userEl;
  return readAttachments([container], CLAUDE_SELECTORS.attachmentTile);
}

/**
 * Concatenated text of all thinking blocks in the whole document. Only changes between two ticks
 * matter (growth while visible answer text is unchanged signals active thinking), so blocks of
 * earlier turns, being static, cancel out.
 */
function readThinkingBlocksText(): string {
  return Array.from(document.querySelectorAll(CLAUDE_SELECTORS.thinkingBlock))
    .map(readText)
    .join('\n');
}

/**
 * Whether Claude's DOM currently shows an active thinking block (a thinking container inside
 * `[data-is-streaming="true"]`, or a growing thinking section).
 */
function hasActiveThinkingDomSignal(thinkingTextChanged: boolean): boolean {
  if (thinkingTextChanged) return true;
  return Array.from(document.querySelectorAll(CLAUDE_SELECTORS.streamingContainer)).some((node) =>
    matchesOrContains(node, CLAUDE_SELECTORS.thinkingBlock),
  );
}

/**
 * Accumulates Claude's thinking time across:
 *   1. The initial pre-stream thinking phase (`t0 -> tStreamStart`), and
 *   2. Any interleaved thinking phases mid-turn, identified when visible response text stops
 *      growing while Claude is still generating and either:
 *      - a thinking block in the DOM is actively streaming/mutating, or
 *      - visible text stalls for `>= INTERLEAVED_STALL_MS` (backdated to when visible text
 *        last changed).
 */
function createThinkingAggregator() {
  let active = false;
  let accumulatedInterleavedMs = 0;
  let interleavedStart: number | null = null;
  let seenVisibleStream = false;
  let lastVisibleText = '';
  let lastVisibleChangeAt: number | null = null;
  let lastThinkingText = '';

  const reset = () => {
    accumulatedInterleavedMs = 0;
    interleavedStart = null;
    seenVisibleStream = false;
    lastVisibleText = '';
    lastVisibleChangeAt = null;
  };

  const closeInterleaved = (endMs: number) => {
    if (interleavedStart === null) return;
    if (endMs > interleavedStart) {
      accumulatedInterleavedMs += endMs - interleavedStart;
    }
    interleavedStart = null;
  };

  const startTurn = (): void => {
    reset();
    active = true;
    lastThinkingText = readThinkingBlocksText();
  };

  return {
    startTurn,

    tick(generating: boolean, visibleText: string): void {
      const now = Date.now();
      if (!active) {
        if (!generating) return;
        startTurn();
      }

      const thinkingText = readThinkingBlocksText();
      const thinkingTextChanged = thinkingText !== lastThinkingText;
      lastThinkingText = thinkingText;

      const hasVisible = visibleText.length > 0;
      const visibleTextChanged = visibleText !== lastVisibleText;

      if (hasVisible && (!seenVisibleStream || visibleTextChanged)) {
        // Model is actively streaming visible response text -> close any open interleaved phase.
        closeInterleaved(now);
        seenVisibleStream = true;
        lastVisibleText = visibleText;
        lastVisibleChangeAt = now;
        return;
      }

      // Initial pre-stream thinking is already covered by `tStreamStart - t0`.
      if (!seenVisibleStream) {
        return;
      }

      // After visible streaming has started, check if Claude started thinking again:
      if (generating) {
        const domThinking = hasActiveThinkingDomSignal(thinkingTextChanged);
        const stalled =
          lastVisibleChangeAt !== null && now - lastVisibleChangeAt >= INTERLEAVED_STALL_MS;

        if (domThinking || stalled) {
          if (interleavedStart === null) {
            // Backdate to the exact timestamp when visible streaming paused.
            interleavedStart = lastVisibleChangeAt ?? now;
          }
          return;
        }
      } else if (interleavedStart !== null) {
        // Generation ended: clamp any open stall to when the last visible token arrived so the
        // post-stream settle window isn't mistaken for thinking.
        closeInterleaved(lastVisibleChangeAt ?? now);
      }
    },

    consume(t0: number, tStreamStart: number, t1: number): number {
      const initialThinkingMs = Math.max(0, tStreamStart - t0);
      if (interleavedStart !== null) {
        const endMs = seenVisibleStream ? Math.min(t1, lastVisibleChangeAt ?? t1) : t1;
        closeInterleaved(endMs);
      }
      const totalMs = Math.min(
        Math.max(0, t1 - t0),
        Math.round(initialThinkingMs + accumulatedInterleavedMs),
      );
      reset();
      active = false;
      return totalMs;
    },
  };
}

const thinkingAggregator = createThinkingAggregator();

export const claudeSite: SiteAdapter = {
  provider: 'anthropic',

  matches(host: string): boolean {
    return host === 'claude.ai' || host.endsWith('.claude.ai');
  },

  readModel(): ModelInfo {
    const rawLabel = readText(document.querySelector(CLAUDE_SELECTORS.modelSelector));
    const latest = latestOf(CLAUDE_SELECTORS.assistantMessage);
    const hasExtendedThinking =
      document.querySelector(CLAUDE_SELECTORS.thinkingToggle) !== null ||
      hasMatch(rootsOf(latest), CLAUDE_SELECTORS.thinkingIndicator);
    return rawLabel
      ? buildModelInfo(rawLabel, hasExtendedThinking, capture.models.claude)
      : unknownModel(capture.models.claude.fallbackName, hasExtendedThinking);
  },

  readUserInput(): string {
    return readUserText(latestOf(CLAUDE_SELECTORS.userMessage));
  },

  readUserAttachments(): AttachmentKind[] {
    return readTurnAttachments(latestOf(CLAUDE_SELECTORS.userMessage));
  },

  readResponse(): string {
    return readResponseText(latestOf(CLAUDE_SELECTORS.assistantMessage));
  },

  readArtifactText(): string {
    return readArtifactText(
      rootsOf(latestOf(CLAUDE_SELECTORS.assistantMessage)),
      CLAUDE_SELECTORS.artifactCard,
      CLAUDE_SELECTORS.artifactPanel,
    );
  },

  readToolCalls(): ToolCallKind[] {
    return readToolCalls(rootsOf(latestOf(CLAUDE_SELECTORS.assistantMessage)), CLAUDE_TOOLS);
  },

  readHistory(): ChatTurn[] {
    return buildHistory(
      readTurnNodes(CLAUDE_ALL_TURNS, CLAUDE_SELECTORS.userMessage),
      ({ role, node }) =>
        role === 'user'
          ? makeTurn(role, readUserText(node), readTurnAttachments(node))
          : makeTurn(role, readResponseText(node), []),
    );
  },

  countUserMessages(): number {
    return queryOutermost(CLAUDE_SELECTORS.userMessage).length;
  },

  countResponses(): number {
    return queryOutermost(CLAUDE_SELECTORS.assistantMessage).length;
  },

  /** Side effect: feeds the thinking aggregator on every call. */
  isGenerating(): boolean {
    const generating =
      document.querySelector(CLAUDE_SELECTORS.streamingContainer) !== null ||
      document.querySelector(CLAUDE_SELECTORS.stopButton) !== null;
    thinkingAggregator.tick(
      generating,
      readResponseText(latestOf(CLAUDE_SELECTORS.assistantMessage)),
    );
    return generating;
  },

  isStreamingVisibleText(): boolean {
    return readResponseText(latestOf(CLAUDE_SELECTORS.assistantMessage)).length > 0;
  },

  /** Side effect: a hit starts a new thinking-time turn. */
  isPromptInput(target: Element): boolean {
    const matched = target.closest(CLAUDE_SELECTORS.promptInput) !== null;
    if (matched) thinkingAggregator.startTurn();
    return matched;
  },

  /** Side effect: a hit starts a new thinking-time turn. */
  isSendButton(target: Element): boolean {
    const matched = target.closest(CLAUDE_SELECTORS.sendButton) !== null;
    if (matched) thinkingAggregator.startTurn();
    return matched;
  },

  consumeThinkingTimeMs(t0: number, tStreamStart: number, t1: number): number {
    return thinkingAggregator.consume(t0, tStreamStart, t1);
  },
};
