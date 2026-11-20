/**
 * SiteAdapter for Gemini (gemini.google.com). Provider: google.
 *
 * Responsibility: Only hooks into Gemini's DOM (Angular custom elements like <user-query> and
 * <model-response>) and exposes selectors/reads. Waits until a response stream is completely
 * finished before forwarding timings to the dom-capture.strategy.
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import type { ChatTurn, ModelInfo, ThinkingEffort } from '../../dto/chat-capture.dto';
import type { OnTurnCompleted, SiteAdapter } from './site-adapter.types';

/**
 * Centralized DOM selectors for Google Gemini (gemini.google.com).
 * Kept at the top of the file so UI updates only require selector adjustments here.
 */
export const GEMINI_SELECTORS = {
  /** Main chat history scroll container in Gemini's web app. */
  chatContainer: 'chat-window, main, #chat-history',
  /** Rich-textarea / Quill contenteditable prompt field in the Gemini input area. */
  promptInput: 'rich-textarea .ql-editor, div[contenteditable="true"][role="textbox"]',
  /** Send message button in the composer. */
  sendButton: 'button.send-button, button[aria-label="Send message"]',
  /** Stop button or active streaming indicator during generation. */
  stopButton: 'button[aria-label="Stop response"], button[aria-label="Stop generating"]',
  /** Loading / streaming state indicators on the active model-response custom element. */
  streamingIndicator:
    'model-response[is-streaming="true"], .mat-mdc-progress-spinner, [data-test-id="streaming-indicator"]',
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
  thinkingDrawer: 'model-thoughts, [data-test-id="model-thoughts"], .thoughts-container',
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

  let thinkingEffort: ThinkingEffort = 'none';
  if (hasThinkingDrawer || lower.includes('thinking') || lower.includes('pro')) {
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
 * Reads the visible response text from a `<model-response>` element while excluding
 * any collapsible `<model-thoughts>` drawer so thinking summaries aren't double-counted as output.
 */
function extractGeminiResponseText(modelResponseEl: Element | null | undefined): string {
  if (!modelResponseEl) return '';
  const messageContent =
    modelResponseEl.querySelector('message-content, .model-response-text') ?? modelResponseEl;
  return extractCleanText(messageContent);
}

/**
 * Gemini site adapter implementation.
 */
export const geminiSite: SiteAdapter = {
  provider: 'google',

  matches(host: string): boolean {
    return host === 'gemini.google.com';
  },

  getChatContainer(): Element {
    return document.querySelector(GEMINI_SELECTORS.chatContainer) ?? document.body;
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

  /**
   * Hooks into Gemini's DOM to capture t0 (user sends prompt), tStreamStart (when the visible
   * <message-content> begins populating after any thinking spinner/drawer), and t1 (when the
   * stream finishes). Only invokes `onCompleted` once the stream is completely done.
   */
  observeTurnCompletion(onCompleted: OnTurnCompleted): () => void {
    let t0: number | null = null;
    let tStreamStart: number | null = null;
    let wasGenerating = false;
    let initialResponseCount = document.querySelectorAll('model-response').length;
    let settleTimer: number | null = null;

    const markPromptSent = () => {
      if (t0 === null) {
        t0 = Date.now();
        tStreamStart = null;
        initialResponseCount = document.querySelectorAll('model-response').length;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        const target = event.target as Element | null;
        if (target && target.closest(GEMINI_SELECTORS.promptInput)) {
          markPromptSent();
        }
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(GEMINI_SELECTORS.sendButton)) {
        markPromptSent();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('click', onClick, true);

    const observer = new MutationObserver(() => {
      const generating = this.isGenerating();
      const responseCount = document.querySelectorAll('model-response').length;
      const hasNewResponseTurn = responseCount > initialResponseCount;

      if (generating && t0 === null) {
        t0 = Date.now();
        initialResponseCount = Math.max(0, responseCount - 1);
      }

      if (generating) {
        wasGenerating = true;
        if (settleTimer !== null) {
          window.clearTimeout(settleTimer);
          settleTimer = null;
        }
      }

      // Record tStreamStart once the new <model-response> renders visible answer characters
      if (
        t0 !== null &&
        tStreamStart === null &&
        hasNewResponseTurn &&
        this.isStreamingVisibleText()
      ) {
        tStreamStart = Date.now();
      }

      // Only notify the strategy once the stream is finished and settled
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
          initialResponseCount = document.querySelectorAll('model-response').length;
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
