/**
 * SiteAdapter for ChatGPT (chatgpt.com). Provider: openai.
 *
 * Responsibility: Only knows ChatGPT's DOM and exposes selectors/reads.
 * Timing (when a prompt was sent / finished) lives in dom-capture.strategy.
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import type { ChatTurn, ModelInfo, ThinkingEffort } from '../../dto/chat-capture.dto';
import type { SiteAdapter } from './site-adapter.types';

/**
 * Centralized DOM selectors for ChatGPT (chatgpt.com).
 * Kept at the top of the file so UI updates only require selector adjustments here.
 */
export const CHATGPT_SELECTORS = {
  /** Prompt input element (ProseMirror contenteditable div or fallback textarea). */
  promptInput: '#prompt-textarea, [contenteditable="true"]#prompt-textarea',
  /** Send button in the composer footer. */
  sendButton:
    'button[data-testid="send-button"], button[aria-label*="Send"], form button[type="submit"]',
  /** Stop button shown only while ChatGPT is actively generating/streaming a response. */
  stopButton: 'button[data-testid="stop-button"], button[aria-label*="Stop"]',
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

  let thinkingEffort: ThinkingEffort = hasThinkingToggle ? 'medium' : 'unknown';
  if (lower.includes('high')) {
    thinkingEffort = 'high';
  } else if (lower.includes('medium')) {
    thinkingEffort = 'medium';
  } else if (lower.includes('low')) {
    thinkingEffort = 'low';
  } else if (lower.includes('instant') || lower.includes('non-reasoning') || lower.includes('4o')) {
    thinkingEffort = hasThinkingToggle ? 'medium' : 'none';
  } else if (
    lower.includes('thinking') ||
    lower.includes('pro') ||
    /\bo[134]\b/.test(lower) ||
    /\b5(?:\.\d+)?\b/.test(lower)
  ) {
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

  countUserMessages(): number {
    return document.querySelectorAll(CHATGPT_SELECTORS.userMessage).length;
  },

  countResponses(): number {
    return document.querySelectorAll(CHATGPT_SELECTORS.assistantMessage).length;
  },

  isPromptInput(target: Element): boolean {
    return target.closest(CHATGPT_SELECTORS.promptInput) !== null;
  },

  isSendButton(target: Element): boolean {
    return target.closest(CHATGPT_SELECTORS.sendButton) !== null;
  },
};
