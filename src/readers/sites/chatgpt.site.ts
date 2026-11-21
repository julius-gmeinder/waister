/**
 * ChatGPT SiteAdapter (chatgpt.com): selectors and reads for one chat app.
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
 * Context: content
 * Docs: docs/modules.md#site-adapters
 */

import { capture } from '../../config/config.json';
import type { ModelFamily } from '../../config/config.types';
import type {
  AttachmentKind,
  ChatTurn,
  ModelInfo,
  ThinkingEffort,
  ToolCallKind,
} from '../../dto/chat-capture.dto';
import {
  outermost,
  readArtifactText,
  readAttachments,
  readToolCalls,
  type ToolSelectors,
} from '../dom-content.reader';
import { familyDefaultEffort, THINKING_DETECTED_EFFORT } from './effort-inference.helpers';
import type { SiteAdapter } from './site-adapter.types';
import {
  buildHistory,
  hasMatch,
  joinMarkdown,
  joinSelectors,
  makeTurn,
  matchesOrContains,
  queryOutermost,
  readText,
  toolBlockSelector,
  unknownModel,
  type Role,
} from './site.helpers';

/** Typed against the families in `config.json`, so a rename there fails the typecheck. */
const GPT: ModelFamily<'openai'> = 'gpt';
const O_SERIES: ModelFamily<'openai'> = 'openai-o';

const CHATGPT_SELECTORS = {
  promptInput:
    '#prompt-textarea, #mobile-composer-prompt, [data-mobile-composer-prompt], [data-composer-markdown], form[data-chatgpt-composer] .ProseMirror[contenteditable="true"], #pending-conversation-input',
  sendButton:
    'button[data-testid="send-button"], #composer-submit-button, button[data-composer-submit]:not([data-stop-generating]), form[data-chatgpt-composer] button[type="submit"]:not([disabled]):not([aria-disabled="true"])',
  /** Scoped to the composer so localized or unrelated page buttons (dictation, read aloud) never match. */
  stopButton:
    'button[data-testid="stop-button"], button[data-composer-submit][data-stop-generating], form[data-chatgpt-composer] button[aria-label="Stop"], form[data-chatgpt-composer] button[aria-label="Stop generating"]',
  roleNode:
    '[data-message-author-role], [data-message-role], [data-user-message-bubble], [data-response-body]',
  /** Role attribute of the classic app (`user` / `assistant`). */
  classicRoleAttr: 'data-message-author-role',
  /** Role attribute of the web-mobile shell (`user` / `assistant`). */
  mobileRoleAttr: 'data-message-role',
  /** User message bubble (logged-in and web-mobile shells). */
  userBubble: '[data-user-message-bubble]',
  /** Assistant answer wrapper of the logged-in app. */
  assistantBody: '[data-response-body]',
  /** Excludes the "Thinking…" placeholder (`[data-response-starting]`). */
  assistantMarkdown:
    '.markdown, [data-assistant-markdown-root], [data-markdown-text-style="assistant-message"], [data-dil-response]',
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
  /** Thinking markers inside an answer. Checked in the latest turn only. */
  thinkingBadge: '[data-testid*="thought"], [aria-label*="Thinking"], [aria-label*="Reason"]',
  /** Collapsible thought/reasoning drawers that must not be scraped as visible output markdown. */
  thinkingBlock:
    '[data-testid*="thought"], [aria-label*="Thinking"], [aria-label*="Reason"], details[class*="thought"], [class*="thought-block"]',
  /** Pressed composer toggle (e.g. "Think"). Page state, not part of any turn. */
  thinkingToggle: 'form[data-chatgpt-composer] button[aria-pressed="true"]',
  /** Inside a message but not model output: role headings, action rows, placeholders. */
  messageChrome:
    '[data-response-starting], [data-assistant-placeholder-slot], [data-message-attribution], h4[data-conversation-role], [data-message-actions], .turn-action-controls, [role="status"]',
  /** Ancestor of a user role node that also holds its attachments. */
  userTurnContainer:
    '[data-chatgpt-search-unit-key], li[data-message-role], [data-message-author-role]',
  // UNVERIFIED: the selectors below were not checked on the live site.
  /** File / pasted-content cards in a user turn. */
  attachmentTile: '[data-testid*="file"], [data-testid*="attachment"], [class*="file-tile"]',
  /** Canvas card inside the answer. */
  artifactCard: '[data-testid*="canvas"], [data-testid*="textdoc"], [id^="textdoc-message"]',
  /** Canvas side panel with the document. */
  artifactPanel:
    '[data-testid="canvas-panel"], [data-testid*="textdoc-editor"], section[data-testid*="canvas"] .ProseMirror',
} as const;

// UNVERIFIED: everything except `utm_source=chatgpt.com` on cited links.
const CHATGPT_TOOLS: ToolSelectors = {
  search: '[data-testid*="web-search"], [data-testid="search-results"]',
  code: '[data-testid*="code-interpreter"], [data-testid*="execution-output"]',
  other: '',
  searchEvidence:
    'a[href*="utm_source=chatgpt.com"], [data-testid*="citation"], [data-testid*="webpage-citation"]',
};

/** Not model output: thinking drawers, UI chrome, canvas cards and tool blocks (counted separately). */
const CHATGPT_MESSAGE_CHROME = joinSelectors(
  CHATGPT_SELECTORS.thinkingBlock,
  CHATGPT_SELECTORS.messageChrome,
  CHATGPT_SELECTORS.artifactCard,
  toolBlockSelector(CHATGPT_TOOLS),
);

const MODELS = capture.models.chatgpt;

/** Case-insensitive, so patterns work on slugs, lowercased labels and raw labels alike. */
function pattern(source: string): RegExp {
  return new RegExp(source, 'i');
}

const SLUG = {
  oSeries: pattern(MODELS.slug.oSeries),
  oSeriesVersion: pattern(MODELS.slug.oSeriesVersion),
  gptVersion: pattern(MODELS.slug.gptVersion),
  reasoning: pattern(MODELS.slug.reasoning),
};

const LABEL = {
  reasoningPatterns: MODELS.label.reasoningPatterns.map(pattern),
  oSeries: pattern(MODELS.label.oSeries),
  version: pattern(MODELS.label.version),
};

/**
 * Whole-word regexes per effort, in the order they are checked
 * (max > xhigh > high > medium > low).
 */
const EFFORT_PATTERNS: [ThinkingEffort, RegExp][] = (
  ['max', 'xhigh', 'high', 'medium', 'low'] as const
).map((effort) => [effort, pattern(`\\b(${MODELS.effortWords[effort].join('|')})\\b`)]);

/**
 * Named ChatGPT model families from `capture.models.chatgpt.families`, checked before falling back
 * to `openai-o` or generic `gpt`.
 */
const FAMILY_KEYWORDS: [ModelFamily<'openai'>, string[]][] = Object.entries(MODELS.families).map(
  ([family, keywords]) => [family as ModelFamily<'openai'>, keywords],
);

function matchChatGptFamily(lower: string): ModelFamily<'openai'> | null {
  return (
    FAMILY_KEYWORDS.find(([, keywords]) => keywords.some((kw) => lower.includes(kw)))?.[0] ?? null
  );
}

interface GptTurn {
  role: Role;
  nodes: Element[];
}

function resolveNodeRole(node: Element): Role | null {
  for (const attr of [CHATGPT_SELECTORS.classicRoleAttr, CHATGPT_SELECTORS.mobileRoleAttr]) {
    const value = node.getAttribute(attr);
    if (value === 'user' || value === 'assistant') return value;
    if (value !== null) return null;
  }
  if (node.matches(CHATGPT_SELECTORS.userBubble)) return 'user';
  if (node.matches(CHATGPT_SELECTORS.assistantBody)) return 'assistant';
  return null;
}

function readTurns(): GptTurn[] {
  const turns: GptTurn[] = [];
  for (const node of queryOutermost(CHATGPT_SELECTORS.roleNode)) {
    const role = resolveNodeRole(node);
    if (!role) continue;
    const last = turns[turns.length - 1];
    if (last?.role === role) {
      last.nodes.push(node);
    } else {
      turns.push({ role, nodes: [node] });
    }
  }
  return turns;
}

function latestTurnOf(role: Role): GptTurn | undefined {
  return readTurns()
    .filter((turn) => turn.role === role)
    .at(-1);
}

/** Undefined while the answer to the latest user turn isn't rendered yet. */
function latestAssistantTurn(): GptTurn | undefined {
  const last = readTurns().at(-1);
  return last?.role === 'assistant' ? last : undefined;
}

function outermostMatches(turn: GptTurn, selector: string): Element[] {
  return turn.nodes.flatMap((node) => outermost(node, selector));
}

/** '' while the model is still thinking. Excludes `.markdown` nodes nested inside thought drawers. */
function readAnswerMarkdown(turn: GptTurn): string {
  const answerNodes = outermostMatches(turn, CHATGPT_SELECTORS.assistantMarkdown).filter(
    (el) => el.closest(CHATGPT_SELECTORS.thinkingBlock) === null,
  );
  return joinMarkdown(answerNodes, {
    skip: CHATGPT_MESSAGE_CHROME,
  });
}

function readTurnText(turn: GptTurn): string {
  if (turn.role === 'assistant') {
    return readAnswerMarkdown(turn) || joinMarkdown(turn.nodes, { skip: CHATGPT_MESSAGE_CHROME });
  }
  const options = { skip: CHATGPT_MESSAGE_CHROME, preserveLineBreaks: true };
  return (
    joinMarkdown(outermostMatches(turn, CHATGPT_SELECTORS.userBubble), options) ||
    joinMarkdown(turn.nodes, options)
  );
}

function readTurnAttachments(turn: GptTurn | undefined): AttachmentKind[] {
  if (!turn || turn.role !== 'user') return [];
  const containers = new Set(
    turn.nodes.map((node) => node.closest(CHATGPT_SELECTORS.userTurnContainer) ?? node),
  );
  return readAttachments([...containers], CHATGPT_SELECTORS.attachmentTile);
}

function parseEffort(lower: string): ThinkingEffort | null {
  return EFFORT_PATTERNS.find(([, regex]) => regex.test(lower))?.[0] ?? null;
}

/**
 * Parses slugs like "gpt-4o", "gpt-5-1-thinking", "o4-mini-high", "gpt-astra". `uiLabel` supplies
 * the effort when the slug doesn't carry it (e.g. "Thinking · Extended" in the model picker).
 */
export function parseChatGptSlug(slug: string, uiLabel: string): ModelInfo {
  const lower = slug.toLowerCase();
  const words = lower.replace(/[-_]/g, ' ');
  const labelLower = uiLabel.toLowerCase();
  const explicitEffort = parseEffort(words) ?? parseEffort(labelLower);
  const matchedFamily = matchChatGptFamily(lower) ?? matchChatGptFamily(labelLower);

  if (SLUG.oSeries.test(lower)) {
    const version = lower.match(SLUG.oSeriesVersion)?.[1] ?? lower;
    const reasoningEffort = explicitEffort ?? THINKING_DETECTED_EFFORT;
    return { name: O_SERIES, version, thinkingEffort: reasoningEffort, rawLabel: slug };
  }

  const name = matchedFamily ?? GPT;
  const v = lower.match(SLUG.gptVersion);
  const version = v ? `${v[1]}${v[2] ? `.${v[2]}` : ''}${v[3] ?? ''}` : 'unknown';

  const defaultEffort = matchedFamily ? familyDefaultEffort(matchedFamily) : 'unknown';
  const fallbackReasoningEffort =
    defaultEffort !== 'unknown' ? defaultEffort : THINKING_DETECTED_EFFORT;
  // No reasoning marker: the router picked a non-reasoning model (instant / chat / 4o / luna),
  // unless an explicit effort or a family default (e.g. gpt-luna -> low) applies.
  const thinkingEffort = SLUG.reasoning.test(words)
    ? (explicitEffort ?? fallbackReasoningEffort)
    : (explicitEffort ?? (defaultEffort !== 'unknown' ? defaultEffort : 'none'));
  return { name, version, thinkingEffort, rawLabel: slug };
}

/**
 * Parses picker labels like "ChatGPT 4o", "o3-mini-high", "ChatGPT 5 Thinking", "GPT-6 Astra".
 * Fallback for when no message carries a model slug.
 */
export function parseChatGptLabel(rawLabel: string, hasThinkingSignal: boolean): ModelInfo {
  const label = rawLabel.trim();
  const lower = label.toLowerCase();
  const { nonReasoning, reasoning } = MODELS.label;
  const matchedFamily = matchChatGptFamily(lower);
  const name = matchedFamily ?? (LABEL.oSeries.test(lower) ? O_SERIES : GPT);
  const defaultEffort = matchedFamily ? familyDefaultEffort(matchedFamily) : 'unknown';

  let thinkingEffort: ThinkingEffort = hasThinkingSignal ? THINKING_DETECTED_EFFORT : defaultEffort;
  const effort = parseEffort(lower);
  if (effort) {
    thinkingEffort = effort;
  } else if (nonReasoning.some((word) => lower.includes(word))) {
    thinkingEffort = hasThinkingSignal
      ? THINKING_DETECTED_EFFORT
      : defaultEffort !== 'unknown'
        ? defaultEffort
        : 'none';
  } else if (
    reasoning.some((word) => lower.includes(word)) ||
    LABEL.reasoningPatterns.some((regex) => regex.test(lower))
  ) {
    thinkingEffort =
      !hasThinkingSignal && defaultEffort !== 'unknown' ? defaultEffort : THINKING_DETECTED_EFFORT;
  }

  return {
    name,
    version: label.match(LABEL.version)?.[1] ?? 'unknown',
    thinkingEffort,
    rawLabel: label,
  };
}

export const chatgptSite: SiteAdapter = {
  provider: 'openai',

  matches(host: string): boolean {
    return host === 'chatgpt.com' || host.endsWith('.chatgpt.com');
  },

  readModel(): ModelInfo {
    const uiLabel = readText(document.querySelector(CHATGPT_SELECTORS.modelSelector));
    const turn = latestAssistantTurn();

    const slug = turn?.nodes
      .map((node) => node.getAttribute(CHATGPT_SELECTORS.modelSlugAttr))
      .filter((s): s is string => Boolean(s))
      .pop();
    if (slug) return parseChatGptSlug(slug, uiLabel);

    const hasThinkingSignal =
      hasMatch(turn?.nodes ?? [], CHATGPT_SELECTORS.thinkingBadge) ||
      document.querySelector(CHATGPT_SELECTORS.thinkingToggle) !== null;
    return uiLabel
      ? parseChatGptLabel(uiLabel, hasThinkingSignal)
      : unknownModel(GPT, hasThinkingSignal);
  },

  readUserInput(): string {
    const latest = latestTurnOf('user');
    return latest ? readTurnText(latest) : '';
  },

  readUserAttachments(): AttachmentKind[] {
    return readTurnAttachments(latestTurnOf('user'));
  },

  readResponse(): string {
    const turn = latestAssistantTurn();
    return turn ? readTurnText(turn) : '';
  },

  readArtifactText(): string {
    return readArtifactText(
      latestAssistantTurn()?.nodes ?? [],
      CHATGPT_SELECTORS.artifactCard,
      CHATGPT_SELECTORS.artifactPanel,
    );
  },

  readToolCalls(): ToolCallKind[] {
    return readToolCalls(latestAssistantTurn()?.nodes ?? [], CHATGPT_TOOLS);
  },

  readHistory(): ChatTurn[] {
    return buildHistory(readTurns(), (turn) =>
      makeTurn(turn.role, readTurnText(turn), readTurnAttachments(turn)),
    );
  },

  countUserMessages(): number {
    return readTurns().filter((turn) => turn.role === 'user').length;
  },

  countResponses(): number {
    return readTurns().filter((turn) => turn.role === 'assistant').length;
  },

  isGenerating(): boolean {
    if (document.querySelector(CHATGPT_SELECTORS.stopButton) !== null) return true;
    if (document.querySelector(CHATGPT_SELECTORS.activeGenerationIndicator) !== null) return true;
    const turn = latestAssistantTurn();
    return (
      turn?.nodes.some(
        (node) =>
          matchesOrContains(node, CHATGPT_SELECTORS.streamingIndicator) ||
          node.hasAttribute(CHATGPT_SELECTORS.messageStreamingAttr) ||
          // Web-mobile shell: an assistant message without the "complete" flag is still running.
          (node.getAttribute(CHATGPT_SELECTORS.mobileRoleAttr) === 'assistant' &&
            !node.hasAttribute(CHATGPT_SELECTORS.messageCompleteAttr)),
      ) ?? false
    );
  },

  isStreamingVisibleText(): boolean {
    // Only rendered markdown counts, not the "Thinking…" placeholder.
    const turn = latestAssistantTurn();
    return turn ? readAnswerMarkdown(turn).length > 0 : false;
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
