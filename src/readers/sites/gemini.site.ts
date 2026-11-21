/**
 * SiteAdapter for Gemini (gemini.google.com). Turns are Angular custom elements (`<user-query>`,
 * `<model-response>`).
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import type { ChatTurn, ModelInfo, ThinkingEffort } from '../../dto/chat-capture.dto';
import type { SiteAdapter } from './site-adapter.types';

export const GEMINI_SELECTORS = {
  promptInput: 'rich-textarea .ql-editor, div[contenteditable="true"][role="textbox"]',
  /** The same button turns into the stop button while generating, hence `:not(.stop)`. */
  sendButton: 'button.send-button:not(.stop), button[aria-label="Send message"]',
  /** Class/icon first: aria-labels are localized, the English ones are only a fallback. */
  stopButton:
    'button.send-button.stop, .send-button [fonticon="stop"], .send-button [data-mat-icon-name="stop"], button[aria-label="Stop response"], button[aria-label="Stop generating"]',
  streamingIndicator:
    'model-response[is-streaming="true"], model-response .mat-mdc-progress-spinner, [data-test-id="streaming-indicator"]',
  userMessage: 'user-query .query-text, user-query, .user-query-container',
  assistantMessage:
    'model-response message-content, model-response .model-response-text, model-response',
  allTurns: 'user-query, model-response',
  modelSelector:
    '[data-test-id="bard-mode-menu-button"], .input-area-switch-label, button[aria-label*="mode"]',
  thinkingDrawer:
    'model-thoughts, [data-test-id="model-thoughts"], .thoughts-container, [data-test-id*="thought"]',
} as const;

/** Parses selector labels like "2.5 Pro", "2.5 Flash", "2.0 Flash Thinking". */
function parseGeminiModel(rawLabel: string, hasThinkingDrawer: boolean): ModelInfo {
  const cleaned = rawLabel.trim();
  const lower = cleaned.toLowerCase();

  let name = 'gemini';
  if (lower.includes('pro')) {
    name = 'gemini-pro';
  } else if (lower.includes('flash')) {
    name = 'gemini-flash';
  }

  const versionMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  const version = versionMatch?.[1] ?? 'unknown';

  let thinkingEffort: ThinkingEffort = 'unknown';
  if (hasThinkingDrawer || lower.includes('thinking') || lower.includes('pro')) {
    thinkingEffort = 'medium';
  } else if (lower.includes('flash')) {
    thinkingEffort = 'low';
  }

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

const GEMINI_THOUGHT_SELECTOR =
  'model-thoughts, [data-test-id="model-thoughts"], .thoughts-container, [data-test-id*="thought"]';

/**
 * Excludes the `<model-thoughts>` drawer so thinking summaries aren't counted as output and don't
 * trigger `tStreamStart` while the model is still thinking.
 */
function extractGeminiResponseText(modelResponseEl: Element | null | undefined): string {
  if (!modelResponseEl) return '';
  const candidates = Array.from(
    modelResponseEl.querySelectorAll('message-content, .model-response-text'),
  ).filter((el) => el.closest(GEMINI_THOUGHT_SELECTOR) === null);

  if (candidates.length > 0) {
    return candidates
      .map((el) => extractCleanText(el))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  // No answer container yet but a thinking drawer: the visible answer hasn't started.
  if (modelResponseEl.querySelector(GEMINI_THOUGHT_SELECTOR) !== null) {
    return '';
  }

  return extractCleanText(modelResponseEl);
}

export const geminiSite: SiteAdapter = {
  provider: 'google',

  matches(host: string): boolean {
    return host === 'gemini.google.com';
  },

  readModel(): ModelInfo {
    const selectorNode = document.querySelector(GEMINI_SELECTORS.modelSelector);
    const rawLabel = extractCleanText(selectorNode);
    const hasThinkingDrawer = document.querySelector(GEMINI_SELECTORS.thinkingDrawer) !== null;

    if (!rawLabel) {
      return {
        name: 'gemini',
        version: 'unknown',
        thinkingEffort: hasThinkingDrawer ? 'medium' : 'unknown',
        rawLabel: 'unknown',
      };
    }
    return parseGeminiModel(rawLabel, hasThinkingDrawer);
  },

  readUserInput(): string {
    const userQueries = document.querySelectorAll('user-query');
    const latestUser = userQueries[userQueries.length - 1];
    if (!latestUser) return '';
    const queryText = latestUser.querySelector('.query-text') ?? latestUser;
    return extractCleanText(queryText);
  },

  readResponse(): string {
    const responses = document.querySelectorAll('model-response');
    const latestResponse = responses[responses.length - 1];
    return extractGeminiResponseText(latestResponse);
  },

  readHistory(): ChatTurn[] {
    const turnNodes = Array.from(document.querySelectorAll(GEMINI_SELECTORS.allTurns));
    const turns: ChatTurn[] = [];

    for (const node of turnNodes) {
      const tagName = node.tagName.toLowerCase();
      if (tagName === 'user-query') {
        const text = extractCleanText(node.querySelector('.query-text') ?? node);
        if (text) turns.push({ role: 'user', text });
      } else if (tagName === 'model-response') {
        const text = extractGeminiResponseText(node);
        if (text) turns.push({ role: 'assistant', text });
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
    const hasStopButton = document.querySelector(GEMINI_SELECTORS.stopButton) !== null;
    const hasStreamingIndicator =
      document.querySelector(GEMINI_SELECTORS.streamingIndicator) !== null;
    return hasStopButton || hasStreamingIndicator;
  },

  isStreamingVisibleText(): boolean {
    const responses = document.querySelectorAll('model-response');
    const latestResponse = responses[responses.length - 1];
    return extractGeminiResponseText(latestResponse).length > 0;
  },

  countUserMessages(): number {
    return document.querySelectorAll('user-query').length;
  },

  countResponses(): number {
    return document.querySelectorAll('model-response').length;
  },

  isPromptInput(target: Element): boolean {
    return target.closest(GEMINI_SELECTORS.promptInput) !== null;
  },

  isSendButton(target: Element): boolean {
    return target.closest(GEMINI_SELECTORS.sendButton) !== null;
  },
};
