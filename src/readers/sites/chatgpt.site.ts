/**
 * SiteAdapter for ChatGPT (chatgpt.com). Provider: openai.
 *
 * Responsibility: Only hooks into ChatGPT's DOM and exposes selectors/reads.
 * Waits until a response stream is completely finished before forwarding timings to the
 * dom-capture.strategy.
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import type { ChatTurn, ModelInfo, ThinkingEffort } from '../../dto/chat-capture.dto';
import type { OnTurnCompleted, SiteAdapter } from './site-adapter.types';

/**
 * Centralized DOM selectors for ChatGPT (chatgpt.com).
 * Kept at the top of the file so UI updates only require selector adjustments here.
 */
export const CHATGPT_SELECTORS = {
  /** Main scrollable thread container holding conversation turns. */
  chatContainer: 'main',
  /** Prompt input element (ProseMirror contenteditable div or fallback textarea). */
  promptInput: '#prompt-textarea, [contenteditable="true"]#prompt-textarea',
  /** Send button in the composer footer. */
  sendButton: 'button[data-testid="send-button"]',
  /** Stop button shown only while ChatGPT is actively generating/streaming a response. */
  stopButton: 'button[data-testid="stop-button"]',
  /** Conversation turn articles rendered in the thread. */
  turnArticle: 'article[data-testid^="conversation-turn-"]',
  /** Elements carrying the author role ('user' | 'assistant') inside each turn. */
  roleNode: '[data-message-author-role]',
  /** User message bubble nodes. */
  userMessage: '[data-message-author-role="user"]',
  /** Assistant message nodes. */
  assistantMessage: '[data-message-author-role="assistant"]',
  /** Rendered markdown prose inside an assistant turn (excludes hidden thinking headers). */
  assistantProse:
    '[data-message-author-role="assistant"] .markdown.prose, [data-message-author-role="assistant"]',
  /** Active streaming class or indicator on the assistant's markdown block. */
  streamingIndicator: '.result-streaming, .streaming-animation',
  /** Top-left model picker button displaying the active ChatGPT model name/version. */
  modelSelector:
    '[data-testid="model-switcher-dropdown-button"], button[aria-label*="Model selector"]',
  /** Reasoning/thinking effort pill or toggle inside the composer if selected. */
  thinkingBadge: '[data-testid*="thought"], [aria-label*="Thinking"], [aria-label*="Reason"]',
} as const;

/**
 * Parses ChatGPT's raw model button text (e.g. "ChatGPT 4o", "o3-mini-high", "ChatGPT 5 Thinking")
 * into normalized ModelInfo fields.
 */
function parseChatGptModel(rawLabel: string, hasThinkingToggle: boolean): ModelInfo {
  const cleaned = rawLabel.trim();
  const lower = cleaned.toLowerCase();

  let thinkingEffort: ThinkingEffort = hasThinkingToggle ? 'medium' : 'none';
  if (lower.includes('high')) {
    thinkingEffort = 'high';
  } else if (lower.includes('medium')) {
    thinkingEffort = 'medium';
  } else if (lower.includes('low')) {
    thinkingEffort = 'low';
  } else if (lower.includes('thinking') || lower.includes('pro') || /\bo[134]\b/.test(lower)) {
    thinkingEffort = 'medium';
  }

  // Extract model family and version from labels like "ChatGPT 4o", "GPT-4.5", "o3-mini"
  const versionMatch = cleaned.match(/(\d+(?:\.\d+)?[a-z]*|o\d+(?:-\w+)?)/i);
  const version = versionMatch?.[1] ?? 'unknown';
  const name = lower.startsWith('o') || /\bo[134]/.test(lower) ? 'openai-o' : 'gpt';

  return {
    name,
    version,
    thinkingEffort,
    rawLabel: cleaned || 'unknown',
  };
}

/**
 * Helper to extract clean visible text from a message node.
 */
function extractCleanText(element: Element | null | undefined): string {
  if (!element) return '';
  return (element.textContent ?? '').trim();
}

/**
 * ChatGPT site adapter implementation.
 */
export const chatgptSite: SiteAdapter = {
  provider: 'openai',

  matches(host: string): boolean {
    return host === 'chatgpt.com' || host.endsWith('.chatgpt.com');
  },

  getChatContainer(): Element {
    return document.querySelector(CHATGPT_SELECTORS.chatContainer) ?? document.body;
  },

  readModel(): ModelInfo {
    const button = document.querySelector(CHATGPT_SELECTORS.modelSelector);
    const rawLabel = extractCleanText(button);
    const hasThinkingToggle = document.querySelector(CHATGPT_SELECTORS.thinkingBadge) !== null;
    if (!rawLabel) {
      return {
        name: 'gpt',
        version: 'unknown',
        thinkingEffort: hasThinkingToggle ? 'medium' : 'unknown',
        rawLabel: 'unknown',
      };
    }
    return parseChatGptModel(rawLabel, hasThinkingToggle);
  },

  readUserInput(): string {
    const userNodes = document.querySelectorAll(CHATGPT_SELECTORS.userMessage);
    const latestUser = userNodes[userNodes.length - 1];
    return extractCleanText(latestUser);
  },

  readResponse(): string {
    const assistantNodes = document.querySelectorAll(CHATGPT_SELECTORS.assistantMessage);
    const latestAssistant = assistantNodes[assistantNodes.length - 1];
    if (!latestAssistant) return '';
    // Prefer the .markdown.prose inner container so thought-summary buttons aren't mixed in
    const prose = latestAssistant.querySelector('.markdown.prose') ?? latestAssistant;
    return extractCleanText(prose);
  },

  readHistory(): ChatTurn[] {
    const roleNodes = Array.from(document.querySelectorAll(CHATGPT_SELECTORS.roleNode));
    const turns: ChatTurn[] = [];

    for (const node of roleNodes) {
      const roleAttr = node.getAttribute('data-message-author-role');
      if (roleAttr !== 'user' && roleAttr !== 'assistant') continue;

      const contentNode =
        roleAttr === 'assistant' ? (node.querySelector('.markdown.prose') ?? node) : node;
      const text = extractCleanText(contentNode);
      if (text) {
        turns.push({ role: roleAttr, text });
      }
    }

    // Exclude the final prompt/response pair (the current turn being captured)
    if (turns.length >= 2 && turns[turns.length - 1]?.role === 'assistant') {
      return turns.slice(0, -2);
    }
    if (turns.length >= 1 && turns[turns.length - 1]?.role === 'user') {
      return turns.slice(0, -1);
    }
    return [];
  },

  isGenerating(): boolean {
    const hasStopButton = document.querySelector(CHATGPT_SELECTORS.stopButton) !== null;
    const hasStreamingClass = document.querySelector(CHATGPT_SELECTORS.streamingIndicator) !== null;
    return hasStopButton || hasStreamingClass;
  },

  isStreamingVisibleText(): boolean {
    const assistantNodes = document.querySelectorAll(CHATGPT_SELECTORS.assistantMessage);
    const latestAssistant = assistantNodes[assistantNodes.length - 1];
    if (!latestAssistant) return false;
    const prose = latestAssistant.querySelector('.markdown.prose') ?? latestAssistant;
    return extractCleanText(prose).length > 0;
  },

  /**
   * Hooks into ChatGPT's DOM to detect when the user submits a prompt (t0),
   * when visible output streaming starts (tStreamStart), and when streaming is
   * completely finished (t1). Only calls `onCompleted` once the stream is done.
   */
  observeTurnCompletion(onCompleted: OnTurnCompleted): () => void {
    let t0: number | null = null;
    let tStreamStart: number | null = null;
    let wasGenerating = false;
    let initialAssistantCount = document.querySelectorAll(
      CHATGPT_SELECTORS.assistantMessage,
    ).length;
    let settleTimer: number | null = null;

    // Mark t0 when the user presses Enter in the prompt input or clicks the send button
    const markPromptSent = () => {
      if (t0 === null) {
        t0 = Date.now();
        tStreamStart = null;
        initialAssistantCount = document.querySelectorAll(
          CHATGPT_SELECTORS.assistantMessage,
        ).length;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        const target = event.target as Element | null;
        if (target && target.matches(CHATGPT_SELECTORS.promptInput)) {
          markPromptSent();
        }
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(CHATGPT_SELECTORS.sendButton)) {
        markPromptSent();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('click', onClick, true);

    const observer = new MutationObserver(() => {
      const generating = this.isGenerating();
      const assistantCount = document.querySelectorAll(CHATGPT_SELECTORS.assistantMessage).length;
      const hasNewAssistantTurn = assistantCount > initialAssistantCount;

      // Fallback t0 detection if generation started without catching the key/click event
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

      // Record tStreamStart as soon as the new assistant message starts rendering visible text
      if (
        t0 !== null &&
        tStreamStart === null &&
        hasNewAssistantTurn &&
        this.isStreamingVisibleText()
      ) {
        tStreamStart = Date.now();
      }

      // Wait until generation/streaming has completely stopped before notifying the strategy
      if (wasGenerating && !generating && t0 !== null) {
        if (settleTimer !== null) {
          window.clearTimeout(settleTimer);
        }
        const capturedT0 = t0;
        const capturedStreamStart = tStreamStart;

        // Short settle debounce (300ms) ensures ChatGPT's DOM stream is completely finished
        settleTimer = window.setTimeout(() => {
          if (this.isGenerating()) return; // Resumed streaming; keep waiting
          const t1 = Date.now();
          const effectiveStreamStart = capturedStreamStart ?? t1;

          // Reset state for the next prompt turn
          t0 = null;
          tStreamStart = null;
          wasGenerating = false;
          initialAssistantCount = document.querySelectorAll(
            CHATGPT_SELECTORS.assistantMessage,
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
