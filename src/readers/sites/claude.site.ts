/**
 * SiteAdapter for Claude (claude.ai). Provider: anthropic.
 *
 * Responsibility: Only hooks into Claude's DOM and exposes selectors/reads.
 * Waits until a response stream is completely finished before forwarding timings to the
 * dom-capture.strategy.
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import type { ChatTurn, ModelInfo, ThinkingEffort } from '../../dto/chat-capture.dto';
import type { OnTurnCompleted, SiteAdapter } from './site-adapter.types';

/**
 * Centralized DOM selectors for Claude (claude.ai).
 * Kept at the top of the file so UI updates only require selector adjustments here.
 */
export const CLAUDE_SELECTORS = {
  /** Main conversation feed container in Claude's web app. */
  chatContainer: 'main, [data-testid="chat-feed"]',
  /** ProseMirror contenteditable input box in the Claude composer. */
  promptInput: 'div.ProseMirror[contenteditable="true"], [data-testid="chat-input"]',
  /** Send button in the Claude composer. */
  sendButton: 'button[aria-label="Send Message"], button[aria-label="Send message"]',
  /** Stop button visible while Claude is streaming an answer. */
  stopButton:
    'button[aria-label="Stop Response"], button[aria-label="Stop response"], button[aria-label="Stop generating"]',
  /** Active streaming attribute placed on the streaming container by Claude's frontend. */
  streamingContainer: '[data-is-streaming="true"]',
  /** User turn containers in the conversation list. */
  userMessage: '[data-testid="user-message"], .font-user-message',
  /** Assistant turn containers in the conversation list. */
  assistantMessage:
    '.font-claude-message, .font-claude-response, [data-testid="assistant-message"]',
  /** Combined selector matching user and assistant turns in document order. */
  allTurns:
    '[data-testid="user-message"], .font-user-message, .font-claude-message, .font-claude-response, [data-testid="assistant-message"]',
  /** Model selector dropdown trigger showing the active Claude model (e.g. "Claude 3.7 Sonnet"). */
  modelSelector: '[data-testid="model-selector-dropdown"], button[aria-label*="Model"]',
  /** Extended thinking indicator / collapsible thought block in the UI. */
  extendedThinkingIndicator:
    '[data-testid*="thinking"], button[aria-label*="Extended thinking"], [aria-expanded][class*="thinking"]',
} as const;

/**
 * Parses Claude's raw model dropdown label (e.g. "Claude 3.7 Sonnet", "Claude 4.5 Sonnet")
 * into normalized ModelInfo fields.
 */
function parseClaudeModel(rawLabel: string, hasExtendedThinking: boolean): ModelInfo {
  const cleaned = rawLabel.trim();
  const lower = cleaned.toLowerCase();

  let name = 'claude';
  if (lower.includes('sonnet')) {
    name = 'claude-sonnet';
  } else if (lower.includes('opus')) {
    name = 'claude-opus';
  } else if (lower.includes('haiku')) {
    name = 'claude-haiku';
  }

  const versionMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  const version = versionMatch?.[1] ?? 'unknown';

  let thinkingEffort: ThinkingEffort = 'none';
  if (hasExtendedThinking || lower.includes('thinking') || lower.includes('extended')) {
    thinkingEffort = 'medium';
  }

  return {
    name,
    version,
    thinkingEffort,
    rawLabel: cleaned || 'unknown',
  };
}

/**
 * Extracts trimmed text content from a DOM element.
 */
function extractCleanText(element: Element | null | undefined): string {
  if (!element) return '';
  return (element.textContent ?? '').trim();
}

/**
 * Claude site adapter implementation.
 */
export const claudeSite: SiteAdapter = {
  provider: 'anthropic',

  matches(host: string): boolean {
    return host === 'claude.ai' || host.endsWith('.claude.ai');
  },

  getChatContainer(): Element {
    return document.querySelector(CLAUDE_SELECTORS.chatContainer) ?? document.body;
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
        thinkingEffort: hasExtendedThinking ? 'medium' : 'unknown',
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
    return extractCleanText(latestAssistant);
  },

  readHistory(): ChatTurn[] {
    const nodes = Array.from(document.querySelectorAll(CLAUDE_SELECTORS.allTurns));
    const turns: ChatTurn[] = [];

    for (const node of nodes) {
      const isUser = node.matches(CLAUDE_SELECTORS.userMessage);
      const role: 'user' | 'assistant' = isUser ? 'user' : 'assistant';
      const text = extractCleanText(node);
      if (text) {
        turns.push({ role, text });
      }
    }

    // Exclude the latest user prompt and latest assistant response
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
    return hasStreamingAttr || hasStopButton;
  },

  isStreamingVisibleText(): boolean {
    const assistantNodes = document.querySelectorAll(CLAUDE_SELECTORS.assistantMessage);
    const latestAssistant = assistantNodes[assistantNodes.length - 1];
    return extractCleanText(latestAssistant).length > 0;
  },

  /**
   * Hooks into Claude's DOM to capture t0 (user sends prompt), tStreamStart (first visible
   * response tokens appear after any extended thinking phase), and t1 (stream finished).
   * Only invokes `onCompleted` once the response stream is completely done.
   */
  observeTurnCompletion(onCompleted: OnTurnCompleted): () => void {
    let t0: number | null = null;
    let tStreamStart: number | null = null;
    let wasGenerating = false;
    let initialAssistantCount = document.querySelectorAll(CLAUDE_SELECTORS.assistantMessage).length;
    let settleTimer: number | null = null;

    const markPromptSent = () => {
      if (t0 === null) {
        t0 = Date.now();
        tStreamStart = null;
        initialAssistantCount = document.querySelectorAll(CLAUDE_SELECTORS.assistantMessage).length;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        const target = event.target as Element | null;
        if (target && target.closest(CLAUDE_SELECTORS.promptInput)) {
          markPromptSent();
        }
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(CLAUDE_SELECTORS.sendButton)) {
        markPromptSent();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('click', onClick, true);

    const observer = new MutationObserver(() => {
      const generating = this.isGenerating();
      const assistantCount = document.querySelectorAll(CLAUDE_SELECTORS.assistantMessage).length;
      const hasNewAssistantTurn = assistantCount > initialAssistantCount;

      if (generating && t0 === null) {
        t0 = Date.now();
        initialAssistantCount = Math.max(0, assistantCount - 1);
      }

      if (generating) {
        wasGenerating = true;
        if (settleTimer !== null) {
          window.clearTimeout(settleTimer);
          settleTimer = null;
        }
      }

      // Record tStreamStart when the new assistant response block starts showing visible characters
      if (
        t0 !== null &&
        tStreamStart === null &&
        hasNewAssistantTurn &&
        this.isStreamingVisibleText()
      ) {
        tStreamStart = Date.now();
      }

      // Trigger completion only after streaming stops and remains settled
      if (wasGenerating && !generating && t0 !== null) {
        if (settleTimer !== null) {
          window.clearTimeout(settleTimer);
        }
        const capturedT0 = t0;
        const capturedStreamStart = tStreamStart;

        settleTimer = window.setTimeout(() => {
          if (this.isGenerating()) return;
          const t1 = Date.now();
          const effectiveStreamStart = capturedStreamStart ?? t1;

          t0 = null;
          tStreamStart = null;
          wasGenerating = false;
          initialAssistantCount = document.querySelectorAll(
            CLAUDE_SELECTORS.assistantMessage,
          ).length;
          settleTimer = null;

          onCompleted({
            t0: capturedT0,
            tStreamStart: effectiveStreamStart,
            t1,
          });
        }, 300);
      }
    });

    observer.observe(this.getChatContainer(), {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('click', onClick, true);
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
    };
  },
};
