/**
 * SiteAdapter for Claude (claude.ai).
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import type { ChatTurn, ModelInfo, ThinkingEffort } from '../../dto/chat-capture.dto';
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
} as const;

/** Parses dropdown labels like "Claude 3.7 Sonnet", "Claude 4.5 Sonnet". */
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

  let thinkingEffort: ThinkingEffort = 'unknown';
  if (hasExtendedThinking || lower.includes('thinking') || lower.includes('extended')) {
    thinkingEffort = 'medium';
  } else if (lower.includes('haiku')) {
    thinkingEffort = 'none';
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
    return hasStreamingAttr || hasStopButton;
  },

  isStreamingVisibleText(): boolean {
    const assistantNodes = document.querySelectorAll(CLAUDE_SELECTORS.assistantMessage);
    const latestAssistant = assistantNodes[assistantNodes.length - 1];
    return extractCleanText(latestAssistant).length > 0;
  },

  countUserMessages(): number {
    return document.querySelectorAll(CLAUDE_SELECTORS.userMessage).length;
  },

  countResponses(): number {
    return document.querySelectorAll(CLAUDE_SELECTORS.assistantMessage).length;
  },

  isPromptInput(target: Element): boolean {
    return target.closest(CLAUDE_SELECTORS.promptInput) !== null;
  },

  isSendButton(target: Element): boolean {
    return target.closest(CLAUDE_SELECTORS.sendButton) !== null;
  },
};
