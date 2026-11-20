/**
 * SiteAdapter for Gemini (gemini.google.com). Provider: google.
 *
 * Responsibility: Only knows Gemini's DOM (Angular custom elements like <user-query> and
 * <model-response>) and exposes selectors/reads.
 * Timing (when a prompt was sent / finished) lives in dom-capture.strategy.
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import type { ChatTurn, ModelInfo, ThinkingEffort } from '../../dto/chat-capture.dto';
import type { SiteAdapter } from './site-adapter.types';

/**
 * Centralized DOM selectors for Google Gemini (gemini.google.com).
 * Kept at the top of the file so UI updates only require selector adjustments here.
 */
export const GEMINI_SELECTORS = {
  /** Rich-textarea / Quill contenteditable prompt field in the Gemini input area. */
  promptInput: 'rich-textarea .ql-editor, div[contenteditable="true"][role="textbox"]',
  /** Send message button in the composer (it turns into the stop button while generating). */
  sendButton: 'button.send-button:not(.stop), button[aria-label="Send message"]',
  /**
   * Stop button shown during generation. Matched by class/icon first because aria-labels are
   * localized (e.g. German UI), the English labels are only a fallback.
   */
  stopButton:
    'button.send-button.stop, .send-button [fonticon="stop"], .send-button [data-mat-icon-name="stop"], button[aria-label="Stop response"], button[aria-label="Stop generating"]',
  /** Loading / streaming state indicators on the active model-response custom element. */
  streamingIndicator:
    'model-response[is-streaming="true"], model-response .mat-mdc-progress-spinner, [data-test-id="streaming-indicator"]',
  /** Custom element or class wrapping user prompts. */
  userMessage: 'user-query .query-text, user-query, .user-query-container',
  /** Custom element or class wrapping Gemini model responses (excludes thought summary drawers). */
  assistantMessage:
    'model-response message-content, model-response .model-response-text, model-response',
  /** Combined turn elements in conversation order. */
  allTurns: 'user-query, model-response',
  /** Mode / model switcher button in the header or input bar (e.g. "2.5 Pro", "2.5 Flash"). */
  modelSelector:
    '[data-test-id="bard-mode-menu-button"], .input-area-switch-label, button[aria-label*="mode"]',
  /** Expandable thinking drawer shown when Gemini is using a Thinking/Pro model. */
  thinkingDrawer:
    'model-thoughts, [data-test-id="model-thoughts"], .thoughts-container, [data-test-id*="thought"]',
} as const;

/**
 * Parses Gemini's raw model selector label (e.g. "2.5 Pro", "2.5 Flash", "2.0 Flash Thinking")
 * into normalized ModelInfo fields.
 */
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

/**
 * Extracts trimmed text content from a DOM element.
 */
function extractCleanText(element: Element | null | undefined): string {
  if (!element) return '';
  return (element.textContent ?? '').trim();
}

/**
 * Selector matching collapsible thought/reasoning containers inside a `<model-response>` that must
 * not be mistaken for the visible output text.
 */
const GEMINI_THOUGHT_SELECTOR =
  'model-thoughts, [data-test-id="model-thoughts"], .thoughts-container, [data-test-id*="thought"]';

/**
 * Reads the visible response text from a `<model-response>` element while excluding
 * any collapsible `<model-thoughts>` drawer so thinking summaries aren't double-counted as output
 * and don't prematurely trigger `tStreamStart` while the model is still thinking.
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

  // No answer container rendered yet: if a thinking drawer is already present, visible answer
  // streaming has not started yet.
  if (modelResponseEl.querySelector(GEMINI_THOUGHT_SELECTOR) !== null) {
    return '';
  }

  return extractCleanText(modelResponseEl);
}

/**
 * Gemini site adapter implementation.
 */
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
