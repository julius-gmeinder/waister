/**
 * SiteAdapter for ChatGPT (chatgpt.com). Provider: openai.
 *
 * Responsibility: Only knows ChatGPT's DOM and exposes selectors/reads.
 * Timing (when a prompt was sent / finished) lives in dom-capture.strategy.
 *
 * ChatGPT can render one assistant answer as several `[data-message-author-role="assistant"]`
 * nodes (reasoning, tool calls / search, final answer). All reads therefore work on *turns*:
 * consecutive role nodes of the same author are merged into one turn.
 *
 * ChatGPT serves two different DOMs, and every selector covers both:
 *   - classic app: `[data-message-author-role]` nodes, `.markdown` answers, ProseMirror
 *     `#prompt-textarea`, `data-testid` send/stop buttons.
 *   - "web-mobile" shell (seen logged out, `#web-mobile-root`): `li[data-message-role]` nodes,
 *     `[data-assistant-markdown-root]` answers, `textarea#mobile-composer-prompt`. A finished
 *     answer carries `data-message-complete`, an unfinished one doesn't.
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
  /** Prompt input: classic ProseMirror div, or the web-mobile shell's textarea. */
  promptInput: '#prompt-textarea, #mobile-composer-prompt, [data-mobile-composer-prompt]',
  /** Send button in the composer footer (`data-testid` is locale-independent). */
  sendButton: 'button[data-testid="send-button"], #composer-submit-button',
  /**
   * Stop button shown only while ChatGPT is generating. It replaces the send button in the
   * composer. Matched by `data-testid` only: aria-labels are localized and page-wide
   * `aria-label*="Stop"` matches unrelated buttons (dictation, read aloud).
   */
  stopButton: 'button[data-testid="stop-button"]',
  /** Elements carrying the author role ('user' | 'assistant'), one or more per turn. */
  roleNode: '[data-message-author-role], [data-message-role]',
  /** Role attributes on a role node: classic app, web-mobile shell. */
  roleAttrs: ['data-message-author-role', 'data-message-role'],
  /** Rendered markdown answer inside an assistant message (excludes thinking placeholders). */
  assistantMarkdown: '.markdown, [data-assistant-markdown-root]',
  /** User message bubble (web-mobile shell). Without it the whole role node's text is used. */
  userBubble: '[data-user-message-bubble]',
  /** Web-mobile shell: set on an assistant message once its answer is finished. */
  messageCompleteAttr: 'data-message-complete',
  /** Legacy streaming class on the answer being written. Only checked inside the latest turn. */
  streamingIndicator: '.result-streaming',
  /** Attribute on assistant messages naming the model that actually answered (e.g. "gpt-5-1"). */
  modelSlugAttr: 'data-message-model-slug',
  /** Top-left model picker button displaying the active ChatGPT model name/version. */
  modelSelector:
    '[data-testid="model-switcher-dropdown-button"], button[aria-label*="Model selector"]',
  /** Reasoning/thinking effort pill or toggle inside the composer if selected. */
  thinkingBadge: '[data-testid*="thought"], [aria-label*="Thinking"], [aria-label*="Reason"]',
} as const;

type Role = 'user' | 'assistant';

/** One conversation turn: consecutive role nodes of the same author. */
interface GptTurn {
  role: Role;
  nodes: Element[];
}

/**
 * Helper to extract clean visible text from a message node.
 */
function extractCleanText(element: Element | null | undefined): string {
  if (!element) return '';
  return (element.textContent ?? '').trim();
}

/**
 * Reads all user/assistant role nodes in document order and merges consecutive nodes of the same
 * author into one turn.
 */
function readTurns(): GptTurn[] {
  const turns: GptTurn[] = [];
  for (const node of Array.from(document.querySelectorAll(CHATGPT_SELECTORS.roleNode))) {
    // A role node nested in another one belongs to the outer message: don't count it twice.
    if (node.parentElement?.closest(CHATGPT_SELECTORS.roleNode)) continue;
    const role = CHATGPT_SELECTORS.roleAttrs
      .map((attr) => node.getAttribute(attr))
      .find((value) => value !== null);
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

/** The last turn if it is an assistant turn, otherwise null (answer not rendered yet). */
function latestAssistantTurn(): GptTurn | null {
  const turns = readTurns();
  const last = turns[turns.length - 1];
  return last?.role === 'assistant' ? last : null;
}

/**
 * Elements matching `selector` inside the turn's nodes, without ones nested in another match
 * (so text isn't counted twice).
 */
function outermostMatches(turn: GptTurn, selector: string): Element[] {
  return turn.nodes.flatMap((node) =>
    Array.from(node.querySelectorAll(selector)).filter((el) => {
      const outer = el.parentElement?.closest(selector);
      return !outer || !node.contains(outer);
    }),
  );
}

/** Joined, trimmed text of `elements`, skipping empty ones. */
function joinText(elements: Element[]): string {
  return elements
    .map((el) => extractCleanText(el))
    .filter(Boolean)
    .join('\n');
}

/** Rendered markdown answer text of an assistant turn ('' while it is still thinking). */
function markdownText(turn: GptTurn): string {
  return joinText(outermostMatches(turn, CHATGPT_SELECTORS.assistantMarkdown));
}

/**
 * Visible text of a turn: the markdown answer or the user bubble where present, otherwise the
 * raw role node text.
 */
function turnText(turn: GptTurn): string {
  const preferred =
    turn.role === 'assistant'
      ? markdownText(turn)
      : joinText(outermostMatches(turn, CHATGPT_SELECTORS.userBubble));
  return preferred || joinText(turn.nodes);
}

/** Maps effort words used in ChatGPT labels/slugs to a ThinkingEffort, or null if none found. */
function effortFromWords(lower: string): ThinkingEffort | null {
  if (/\b(heavy|extended|high)\b/.test(lower)) return 'high';
  if (/\b(standard|medium)\b/.test(lower)) return 'medium';
  if (/\b(light|low)\b/.test(lower)) return 'low';
  return null;
}

/**
 * Parses a model slug from `data-message-model-slug` (e.g. "gpt-4o", "gpt-5-1-thinking",
 * "o4-mini-high") into normalized ModelInfo fields. `uiLabel` refines the thinking effort when
 * the slug doesn't carry it (e.g. "Thinking · Extended" in the model picker).
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
 * Parses ChatGPT's raw model button text (e.g. "ChatGPT 4o", "o3-mini-high", "ChatGPT 5 Thinking")
 * into normalized ModelInfo fields. Fallback for when no message carries a model slug.
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
 * ChatGPT site adapter implementation.
 */
export const chatgptSite: SiteAdapter = {
  provider: 'openai',

  matches(host: string): boolean {
    return host === 'chatgpt.com' || host.endsWith('.chatgpt.com');
  },

  readModel(): ModelInfo {
    const uiLabel = extractCleanText(document.querySelector(CHATGPT_SELECTORS.modelSelector));

    // The slug on the latest answer names the model that actually answered (Auto mode routes).
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
    // Everything before the latest user turn is history. The latest user turn and its answer
    // are the prompt being captured.
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
    const turn = latestAssistantTurn();
    return (
      turn?.nodes.some(
        (node) =>
          node.matches(CHATGPT_SELECTORS.streamingIndicator) ||
          node.querySelector(CHATGPT_SELECTORS.streamingIndicator) !== null ||
          // Web-mobile shell: an assistant message without the "complete" flag is still running.
          (node.hasAttribute('data-message-role') &&
            !node.hasAttribute(CHATGPT_SELECTORS.messageCompleteAttr)),
      ) ?? false
    );
  },

  isStreamingVisibleText(): boolean {
    // Only rendered markdown counts: the "Thinking…" placeholder is not visible output.
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
    // The composer button turns into the stop button while generating: never count that click.
    return (
      target.closest(CHATGPT_SELECTORS.sendButton) !== null &&
      target.closest(CHATGPT_SELECTORS.stopButton) === null
    );
  },
};
