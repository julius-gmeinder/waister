/**
 * SiteAdapter for Claude (claude.ai).
 *
 * Includes an internal thinking-time aggregator (`claudeThinkingAggregator`) that handles
 * interleaved thinking (e.g. when Claude thinks, outputs text, pauses to think/use tools again,
 * and then resumes streaming visible text).
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import { capture } from '../../config/config.json';
import type { ModelFamily } from '../../config/config.types';
import type { ChatTurn, ModelInfo, ThinkingEffort } from '../../dto/chat-capture.dto';
import { familyDefaultEffort, THINKING_DETECTED_EFFORT } from './effort-inference';
import type { SiteAdapter } from './site-adapter.types';

export const CLAUDE_SELECTORS = {
  promptInput: 'div.ProseMirror[contenteditable="true"], [data-testid="chat-input"]',
  sendButton:
    'button[aria-label="Send Message"], button[aria-label="Send message"], button[aria-label*="Send"], fieldset button[type="button"]:last-of-type',
  stopButton:
    'button[aria-label="Stop Response"], button[aria-label="Stop response"], button[aria-label="Stop generating"], button[aria-label*="Stop"]',
  streamingContainer: '[data-is-streaming="true"]',
  userMessage: '[data-testid="user-message"], .font-user-message',
  assistantMessage:
    '.font-claude-message, .font-claude-response, [data-testid="assistant-message"]',
  /** User and assistant turns in document order. */
  allTurns:
    '[data-testid="user-message"], .font-user-message, .font-claude-message, .font-claude-response, [data-testid="assistant-message"]',
  modelSelector: '[data-testid="model-selector-dropdown"], button[aria-label*="Model"]',
  extendedThinkingIndicator:
    '[data-testid*="thinking"], button[aria-label*="Extended thinking"], [aria-expanded][class*="thinking"]',
  /** Collapsible thinking/thought blocks inside an assistant turn that must not count as visible answer text. */
  thinkingBlock:
    '[data-testid*="thinking"], [aria-expanded][class*="thinking"], details[class*="thinking"], [class*="thinking-block"]',
} as const;

/**
 * Pause threshold (ms) in visible response text while Claude is still generating before we infer
 * that the model has re-entered an interleaved thinking phase. From `config.json`.
 */
const CLAUDE_INTERLEAVED_STALL_MS = capture.timings.claudeInterleavedStallMs;

/** Parses dropdown labels like "Claude 3.7 Sonnet", "Claude 4.5 Sonnet". */
function parseClaudeModel(rawLabel: string, hasExtendedThinking: boolean): ModelInfo {
  const cleaned = rawLabel.trim();
  const lower = cleaned.toLowerCase();

  // Generic 'claude' has no config entry and uses the provider default rates.
  let name: ModelFamily<'anthropic'> | 'claude' = 'claude';
  if (lower.includes('sonnet')) {
    name = 'claude-sonnet';
  } else if (lower.includes('opus')) {
    name = 'claude-opus';
  } else if (lower.includes('haiku')) {
    name = 'claude-haiku';
  }

  const versionMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  const version = versionMatch?.[1] ?? 'unknown';

  const thinkingEffort: ThinkingEffort =
    hasExtendedThinking || lower.includes('thinking') || lower.includes('extended')
      ? THINKING_DETECTED_EFFORT
      : familyDefaultEffort(name);

  return {
    name,
    version,
    thinkingEffort,
    rawLabel: cleaned || 'unknown',
  };
}

function extractCleanText(element: Element | null | undefined): string {
  if (!element) return '';
  return (element.textContent ?? '').trim();
}

/**
 * Reads visible assistant text from a Claude response container while stripping any embedded
 * thinking blocks so thinking summaries do not trigger `isStreamingVisibleText()` early or mask
 * interleaved thinking pauses.
 */
function extractVisibleAssistantText(assistantEl: Element | null | undefined): string {
  if (!assistantEl) return '';
  if (assistantEl.querySelector(CLAUDE_SELECTORS.thinkingBlock) === null) {
    return extractCleanText(assistantEl);
  }
  const clone = assistantEl.cloneNode(true) as Element;
  for (const node of Array.from(clone.querySelectorAll(CLAUDE_SELECTORS.thinkingBlock))) {
    node.remove();
  }
  return extractCleanText(clone);
}

/**
 * Concatenated text of all thinking blocks currently in the DOM (or inside the latest turn).
 * A growth in this text while visible answer text is unchanged signals active thinking.
 */
function readThinkingBlocksText(): string {
  const nodes = Array.from(document.querySelectorAll(CLAUDE_SELECTORS.thinkingBlock));
  return nodes.map((n) => extractCleanText(n)).join('\n');
}

/**
 * Checks whether Claude's DOM currently shows an active thinking block (e.g. a thinking container
 * inside `[data-is-streaming="true"]` or an added/growing thinking section).
 */
function hasActiveThinkingDomSignal(thinkingTextChanged: boolean): boolean {
  if (thinkingTextChanged) return true;
  const streamingNodes = Array.from(document.querySelectorAll(CLAUDE_SELECTORS.streamingContainer));
  return streamingNodes.some(
    (node) =>
      node.matches(CLAUDE_SELECTORS.thinkingBlock) ||
      node.querySelector(CLAUDE_SELECTORS.thinkingBlock) !== null,
  );
}

/**
 * Internal aggregator that accumulates Claude's thinking time across:
 *   1. The initial pre-stream thinking phase (`t0 -> tStreamStart`), and
 *   2. Any interleaved thinking phases mid-turn, identified when visible response text stops
 *      growing while Claude is still generating and either:
 *      - a thinking block in the DOM is actively streaming/mutating, or
 *      - visible text stalls for `>= CLAUDE_INTERLEAVED_STALL_MS` (backdated to when visible text
 *        last changed).
 */
function createClaudeThinkingAggregator() {
  let active = false;
  let accumulatedInterleavedMs = 0;
  let interleavedStart: number | null = null;
  let seenVisibleStream = false;
  let lastVisibleText = '';
  let lastVisibleChangeAt: number | null = null;
  let lastThinkingText = '';

  const closeInterleaved = (endMs: number) => {
    if (interleavedStart === null) return;
    if (endMs > interleavedStart) {
      accumulatedInterleavedMs += endMs - interleavedStart;
    }
    interleavedStart = null;
  };

  return {
    startTurn(): void {
      active = true;
      accumulatedInterleavedMs = 0;
      interleavedStart = null;
      seenVisibleStream = false;
      lastVisibleText = '';
      lastVisibleChangeAt = null;
      lastThinkingText = readThinkingBlocksText();
    },

    tick(generating: boolean, visibleText: string): void {
      const now = Date.now();
      if (!active) {
        if (!generating) return;
        this.startTurn();
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
          lastVisibleChangeAt !== null && now - lastVisibleChangeAt >= CLAUDE_INTERLEAVED_STALL_MS;

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
      active = false;
      accumulatedInterleavedMs = 0;
      interleavedStart = null;
      seenVisibleStream = false;
      lastVisibleText = '';
      lastVisibleChangeAt = null;
      return totalMs;
    },
  };
}

const claudeThinkingAggregator = createClaudeThinkingAggregator();

export const claudeSite: SiteAdapter = {
  provider: 'anthropic',

  matches(host: string): boolean {
    return host === 'claude.ai' || host.endsWith('.claude.ai');
  },

  readModel(): ModelInfo {
    const selectorNode = document.querySelector(CLAUDE_SELECTORS.modelSelector);
    const rawLabel = extractCleanText(selectorNode);
    const hasExtendedThinking =
      document.querySelector(CLAUDE_SELECTORS.extendedThinkingIndicator) !== null;

    if (!rawLabel) {
      return {
        name: 'claude',
        version: 'unknown',
        thinkingEffort: hasExtendedThinking ? THINKING_DETECTED_EFFORT : 'unknown',
        rawLabel: 'unknown',
      };
    }
    return parseClaudeModel(rawLabel, hasExtendedThinking);
  },

  readUserInput(): string {
    const userNodes = document.querySelectorAll(CLAUDE_SELECTORS.userMessage);
    const latestUser = userNodes[userNodes.length - 1];
    return extractCleanText(latestUser);
  },

  readResponse(): string {
    const assistantNodes = document.querySelectorAll(CLAUDE_SELECTORS.assistantMessage);
    const latestAssistant = assistantNodes[assistantNodes.length - 1];
    return extractVisibleAssistantText(latestAssistant);
  },

  readHistory(): ChatTurn[] {
    const nodes = Array.from(document.querySelectorAll(CLAUDE_SELECTORS.allTurns));
    const turns: ChatTurn[] = [];

    for (const node of nodes) {
      const isUser = node.matches(CLAUDE_SELECTORS.userMessage);
      const role: 'user' | 'assistant' = isUser ? 'user' : 'assistant';
      const text = isUser ? extractCleanText(node) : extractVisibleAssistantText(node);
      if (text) {
        turns.push({ role, text });
      }
    }

    // The latest prompt and its answer (if rendered yet) are the capture, not history.
    if (turns.length >= 2 && turns[turns.length - 1]?.role === 'assistant') {
      return turns.slice(0, -2);
    }
    if (turns.length >= 1 && turns[turns.length - 1]?.role === 'user') {
      return turns.slice(0, -1);
    }
    return [];
  },

  isGenerating(): boolean {
    const hasStreamingAttr = document.querySelector(CLAUDE_SELECTORS.streamingContainer) !== null;
    const hasStopButton = document.querySelector(CLAUDE_SELECTORS.stopButton) !== null;
    const generating = hasStreamingAttr || hasStopButton;
    const assistantNodes = document.querySelectorAll(CLAUDE_SELECTORS.assistantMessage);
    const latestAssistant = assistantNodes[assistantNodes.length - 1];
    claudeThinkingAggregator.tick(generating, extractVisibleAssistantText(latestAssistant));
    return generating;
  },

  isStreamingVisibleText(): boolean {
    const assistantNodes = document.querySelectorAll(CLAUDE_SELECTORS.assistantMessage);
    const latestAssistant = assistantNodes[assistantNodes.length - 1];
    return extractVisibleAssistantText(latestAssistant).length > 0;
  },

  countUserMessages(): number {
    return document.querySelectorAll(CLAUDE_SELECTORS.userMessage).length;
  },

  countResponses(): number {
    return document.querySelectorAll(CLAUDE_SELECTORS.assistantMessage).length;
  },

  isPromptInput(target: Element): boolean {
    const matched = target.closest(CLAUDE_SELECTORS.promptInput) !== null;
    if (matched) {
      claudeThinkingAggregator.startTurn();
    }
    return matched;
  },

  isSendButton(target: Element): boolean {
    const matched = target.closest(CLAUDE_SELECTORS.sendButton) !== null;
    if (matched) {
      claudeThinkingAggregator.startTurn();
    }
    return matched;
  },

  consumeThinkingTimeMs(t0: number, tStreamStart: number, t1: number): number {
    return claudeThinkingAggregator.consume(t0, tStreamStart, t1);
  },
};
