/**
 * SiteAdapter for ChatGPT (chatgpt.com).
 *
 * One answer can span several assistant role nodes (reasoning, tool calls, final answer), so all
 * reads work on turns: consecutive role nodes of the same author merged together.
 *
 * ChatGPT serves different DOM architectures depending on auth state, and every selector covers all:
 * - Logged-in app (`#root`, React / Codex app-shell): turns live inside `[data-virtualized-turn]`
 *   with `[data-user-message-bubble]` for user prompts and `[data-response-body]` (containing
 *   `[data-markdown-text-style="assistant-message"]` / `[data-dil-response]`) for assistant answers;
 *   composer is `form[data-chatgpt-composer]` with `.ProseMirror[data-composer-markdown]`.
 * - Logged-out "web-mobile" shell (`#web-mobile-root`, Octane): `li[data-message-role]` turns,
 *   `[data-assistant-markdown-root]` answers, `textarea#mobile-composer-prompt`, and
 *   `button[data-composer-submit]`.
 * - Classic app fallback: `[data-message-author-role]`, `.markdown`, `#prompt-textarea`, and
 *   `data-testid` send/stop buttons.
 *
 * Context: content script
 * Docs: docs/modules.md#site-adapters
 */

import type { ChatTurn, ModelInfo, ThinkingEffort } from '../../dto/chat-capture.dto';
import type { SiteAdapter } from './site-adapter.types';

export const CHATGPT_SELECTORS = {
  promptInput:
    '#prompt-textarea, #mobile-composer-prompt, [data-mobile-composer-prompt], [data-composer-markdown], form[data-chatgpt-composer] .ProseMirror[contenteditable="true"], #pending-conversation-input',
  sendButton:
    'button[data-testid="send-button"], #composer-submit-button, button[data-composer-submit]:not([data-stop-generating]), form[data-chatgpt-composer] button[type="submit"]:not([disabled]):not([aria-disabled="true"])',
  /**
   * Scoped to the composer so localized or unrelated page buttons (dictation, read aloud) never match.
   */
  stopButton:
    'button[data-testid="stop-button"], button[data-composer-submit][data-stop-generating], form[data-chatgpt-composer] button[aria-label="Stop"], form[data-chatgpt-composer] button[aria-label="Stop generating"]',
  roleNode:
    '[data-message-author-role], [data-message-role], [data-user-message-bubble], [data-response-body]',
  /** Classic app, web-mobile shell. */
  roleAttrs: ['data-message-author-role', 'data-message-role'],
  /** Excludes the "Thinking…" placeholder (`[data-response-starting]`). */
  assistantMarkdown:
    '.markdown, [data-assistant-markdown-root], [data-markdown-text-style="assistant-message"], [data-dil-response]',
  /** User message bubble (present in both logged-in and web-mobile shells). */
  userBubble: '[data-user-message-bubble]',
  /** Web-mobile shell: set on an assistant message once its answer is finished. */
  messageCompleteAttr: 'data-message-complete',
  /** Web-mobile shell: set on an assistant message while it is actively streaming. */
  messageStreamingAttr: 'data-message-streaming',
  /** Page-level indicators present only while a turn is starting or actively streaming. */
  activeGenerationIndicator:
    '[data-response-starting], [data-d-streaming-reveal], [data-loading-indicator], form[data-octane-followup-submitting]',
  /** Turn-scoped streaming indicator. Only checked inside the latest turn. */
  streamingIndicator: '.result-streaming, [data-d-streaming-reveal]',
  /** Model that actually answered (e.g. "gpt-5-1"), which can differ from the picker in Auto. */
  modelSlugAttr: 'data-message-model-slug',
  modelSelector:
    '[data-testid="model-switcher-dropdown-button"], button[aria-label*="Model selector"], [data-model-selection-label], button[aria-label="Select ChatGPT model"]',
  thinkingBadge:
    '[data-testid*="thought"], [aria-label*="Thinking"], [aria-label*="Reason"], form[data-chatgpt-composer] button[aria-pressed="true"]',
} as const;

type Role = 'user' | 'assistant';

interface GptTurn {
  role: Role;
  nodes: Element[];
}

function extractCleanText(element: Element | null | undefined): string {
  if (!element) return '';
  return (element.textContent ?? '').trim();
}

function resolveNodeRole(node: Element): Role | null {
  for (const attr of CHATGPT_SELECTORS.roleAttrs) {
    const value = node.getAttribute(attr);
    if (value === 'user' || value === 'assistant') return value;
    if (value !== null) return null;
  }
  if (node.hasAttribute('data-user-message-bubble')) return 'user';
  if (node.hasAttribute('data-response-body')) return 'assistant';
  return null;
}

function readTurns(): GptTurn[] {
  const turns: GptTurn[] = [];
  for (const node of Array.from(document.querySelectorAll(CHATGPT_SELECTORS.roleNode))) {
    // A role node nested in another one belongs to the outer message: don't count it twice.
    if (node.parentElement?.closest(CHATGPT_SELECTORS.roleNode)) continue;
    const role = resolveNodeRole(node);
    if (role !== 'user' && role !== 'assistant') continue;
    const last = turns[turns.length - 1];
    if (last?.role === role) {
      last.nodes.push(node);
    } else {
      turns.push({ role, nodes: [node] });
    }
  }
  return turns;
}

/** Null while the answer to the latest user turn isn't rendered yet. */
function latestAssistantTurn(): GptTurn | null {
  const turns = readTurns();
  const last = turns[turns.length - 1];
  return last?.role === 'assistant' ? last : null;
}

/** Skips matches nested in another match so text isn't counted twice. */
function outermostMatches(turn: GptTurn, selector: string): Element[] {
  return turn.nodes.flatMap((node) => {
    if (node.matches(selector)) return [node];
    return Array.from(node.querySelectorAll(selector)).filter((el) => {
      const outer = el.parentElement?.closest(selector);
      return !outer || !node.contains(outer);
    });
  });
}

function joinText(elements: Element[]): string {
  return elements
    .map((el) => extractCleanText(el))
    .filter(Boolean)
    .join('\n');
}

/** '' while the model is still thinking. */
function markdownText(turn: GptTurn): string {
  return joinText(outermostMatches(turn, CHATGPT_SELECTORS.assistantMarkdown));
}

function turnText(turn: GptTurn): string {
  const preferred =
    turn.role === 'assistant'
      ? markdownText(turn)
      : joinText(outermostMatches(turn, CHATGPT_SELECTORS.userBubble));
  return preferred || joinText(turn.nodes);
}

function effortFromWords(lower: string): ThinkingEffort | null {
  if (/\b(heavy|extended|high)\b/.test(lower)) return 'high';
  if (/\b(standard|medium)\b/.test(lower)) return 'medium';
  if (/\b(light|low)\b/.test(lower)) return 'low';
  return null;
}

/**
 * Parses slugs like "gpt-4o", "gpt-5-1-thinking", "o4-mini-high". `uiLabel` supplies the effort
 * when the slug doesn't carry it (e.g. "Thinking · Extended" in the model picker).
 */
function parseChatGptSlug(slug: string, uiLabel: string): ModelInfo {
  const lower = slug.toLowerCase();
  const words = lower.replace(/[-_]/g, ' ');
  const labelEffort = effortFromWords(uiLabel.toLowerCase());

  if (/^o\d/.test(lower)) {
    const version = lower.match(/^(o\d+(?:-mini|-pro)?)/)?.[1] ?? lower;
    return {
      name: 'openai-o',
      version,
      thinkingEffort: effortFromWords(words) ?? labelEffort ?? 'medium',
      rawLabel: slug,
    };
  }

  const v = lower.match(/^gpt-(\d+)(?:[.-](\d+))?([a-z])?/);
  const version = v ? `${v[1]}${v[2] ? `.${v[2]}` : ''}${v[3] ?? ''}` : 'unknown';

  let thinkingEffort: ThinkingEffort;
  if (/\b(thinking|t|pro)\b/.test(words)) {
    thinkingEffort = effortFromWords(words) ?? labelEffort ?? 'medium';
  } else {
    // Instant / chat / 4o-style answers: the router picked a non-reasoning model.
    thinkingEffort = 'none';
  }

  return { name: 'gpt', version, thinkingEffort, rawLabel: slug };
}

/**
 * Parses picker labels like "ChatGPT 4o", "o3-mini-high", "ChatGPT 5 Thinking". Fallback for when
 * no message carries a model slug.
 */
function parseChatGptModel(rawLabel: string, hasThinkingToggle: boolean): ModelInfo {
  const cleaned = rawLabel.trim();
  const lower = cleaned.toLowerCase();

  let thinkingEffort: ThinkingEffort = hasThinkingToggle ? 'medium' : 'unknown';
  const effort = effortFromWords(lower);
  if (effort) {
    thinkingEffort = effort;
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

export const chatgptSite: SiteAdapter = {
  provider: 'openai',

  matches(host: string): boolean {
    return host === 'chatgpt.com' || host.endsWith('.chatgpt.com');
  },

  readModel(): ModelInfo {
    const uiLabel = extractCleanText(document.querySelector(CHATGPT_SELECTORS.modelSelector));

    const turn = latestAssistantTurn();
    const slug = turn?.nodes
      .map((node) => node.getAttribute(CHATGPT_SELECTORS.modelSlugAttr))
      .filter((s): s is string => Boolean(s))
      .pop();
    if (slug) {
      return parseChatGptSlug(slug, uiLabel);
    }

    const hasThinkingToggle = document.querySelector(CHATGPT_SELECTORS.thinkingBadge) !== null;
    if (!uiLabel) {
      return {
        name: 'gpt',
        version: 'unknown',
        thinkingEffort: hasThinkingToggle ? 'medium' : 'unknown',
        rawLabel: 'unknown',
      };
    }
    return parseChatGptModel(uiLabel, hasThinkingToggle);
  },

  readUserInput(): string {
    const userTurns = readTurns().filter((turn) => turn.role === 'user');
    const latest = userTurns[userTurns.length - 1];
    return latest ? turnText(latest) : '';
  },

  readResponse(): string {
    const turn = latestAssistantTurn();
    return turn ? turnText(turn) : '';
  },

  readHistory(): ChatTurn[] {
    const turns = readTurns();
    // The latest user turn and its answer are the prompt being captured, not history.
    let lastUser = -1;
    turns.forEach((turn, i) => {
      if (turn.role === 'user') lastUser = i;
    });
    return turns
      .slice(0, Math.max(0, lastUser))
      .map((turn) => ({ role: turn.role, text: turnText(turn) }))
      .filter((turn) => turn.text);
  },

  isGenerating(): boolean {
    if (document.querySelector(CHATGPT_SELECTORS.stopButton) !== null) return true;
    if (document.querySelector(CHATGPT_SELECTORS.activeGenerationIndicator) !== null) return true;
    const turn = latestAssistantTurn();
    return (
      turn?.nodes.some(
        (node) =>
          node.matches(CHATGPT_SELECTORS.streamingIndicator) ||
          node.querySelector(CHATGPT_SELECTORS.streamingIndicator) !== null ||
          node.hasAttribute(CHATGPT_SELECTORS.messageStreamingAttr) ||
          // Web-mobile shell: an assistant message without the "complete" flag is still running.
          (node.getAttribute('data-message-role') === 'assistant' &&
            !node.hasAttribute(CHATGPT_SELECTORS.messageCompleteAttr)),
      ) ?? false
    );
  },

  isStreamingVisibleText(): boolean {
    // Only rendered markdown counts, not the "Thinking…" placeholder.
    const turn = latestAssistantTurn();
    return turn ? markdownText(turn).length > 0 : false;
  },

  countUserMessages(): number {
    return readTurns().filter((turn) => turn.role === 'user').length;
  },

  countResponses(): number {
    return readTurns().filter((turn) => turn.role === 'assistant').length;
  },

  isPromptInput(target: Element): boolean {
    return target.closest(CHATGPT_SELECTORS.promptInput) !== null;
  },

  isSendButton(target: Element): boolean {
    // The composer button becomes the stop button while generating: don't count that click.
    return (
      target.closest(CHATGPT_SELECTORS.sendButton) !== null &&
      target.closest(CHATGPT_SELECTORS.stopButton) === null
    );
  },
};
