/**
 * SiteHelpers: pure DOM-read and label-parsing helpers shared by the three site adapters.
 * Internal to `sites/` (role suffix `*.helpers.ts` = folder-internal helpers), no site knowledge:
 * every selector and keyword table is passed in by the adapter.
 *
 * Context: content
 * Docs: docs/modules.md#site-adapters
 */

import type { ModelKeywordConfig } from '../../config/config.types';
import type { AttachmentKind, ChatTurn, ModelInfo } from '../../dto/chat-capture.dto';
import {
  domToMarkdown,
  outermost,
  type MarkdownOptions,
  type ToolSelectors,
} from '../dom-content.reader';
import { familyDefaultEffort, THINKING_DETECTED_EFFORT } from './effort-inference.helpers';

export type Role = ChatTurn['role'];

/** One user or assistant message node of the page. */
export interface TurnNode {
  role: Role;
  node: Element;
}

// --- DOM reads ----------------------------------------------------------------------------

/** Trimmed text content, '' for a missing node. */
export function readText(element: Element | null | undefined): string {
  return (element?.textContent ?? '').trim();
}

/** The node itself or a descendant matches `selector`. */
export function matchesOrContains(node: Element, selector: string): boolean {
  return node.matches(selector) || node.querySelector(selector) !== null;
}

/** Joins non-empty selector lists into one, e.g. to derive a chrome selector from the tables. */
export function joinSelectors(...selectors: string[]): string {
  return selectors.filter(Boolean).join(', ');
}

/** Selector for all tool-call blocks of a site, derived from its tools table. */
export function toolBlockSelector(tools: ToolSelectors): string {
  return joinSelectors(tools.search, tools.code, tools.other);
}

/** Outermost matches in the page, in document order. Nested matches belong to the outer one. */
export function queryOutermost(selector: string): Element[] {
  return outermost(document.documentElement, selector);
}

export function latestOf(selector: string): Element | undefined {
  return queryOutermost(selector).at(-1);
}

/** `[node]`, or `[]` for a missing node, so adapters can pass a latest-turn lookup straight on. */
export function rootsOf(node: Element | undefined): Element[] {
  return node ? [node] : [];
}

/**
 * Whether `selector` matches in or below any of `roots`, e.g. the latest assistant turn.
 * Returns `false` when `roots` is empty so state from earlier turns never leaks into a new turn.
 */
export function hasMatch(roots: readonly Element[], selector: string): boolean {
  if (roots.length === 0 || !selector) return false;
  return roots.some((root) => matchesOrContains(root, selector));
}

/** Markdown of several nodes, one paragraph each, empty ones dropped. */
export function joinMarkdown(nodes: readonly Element[], options: MarkdownOptions = {}): string {
  return nodes
    .map((node) => domToMarkdown(node, options))
    .filter(Boolean)
    .join('\n\n');
}

/** All user and assistant nodes in document order, outermost only. */
export function readTurnNodes(allTurns: string, userTurn: string): TurnNode[] {
  return queryOutermost(allTurns).map((node) => ({
    role: node.matches(userTurn) ? 'user' : 'assistant',
    node,
  }));
}

// --- Turns --------------------------------------------------------------------------------

export function makeTurn(role: Role, text: string, attachments: AttachmentKind[]): ChatTurn {
  return { role, text, ...(attachments.length ? { attachments } : {}) };
}

/**
 * Turns before the latest user turn, oldest first, without empty ones. The latest user turn and
 * its answer are the prompt being captured. Cut by position before dropping empty turns, so an
 * empty latest user turn (unrendered, attachment-only) can't shift the cut.
 */
export function buildHistory<T extends { role: Role }>(
  turns: readonly T[],
  readTurn: (turn: T) => ChatTurn,
): ChatTurn[] {
  // Manual search: `findLastIndex` is ES2023, the project targets ES2022.
  let lastUser = -1;
  turns.forEach((turn, i) => {
    if (turn.role === 'user') lastUser = i;
  });
  return turns
    .slice(0, Math.max(0, lastUser))
    .map(readTurn)
    .filter((turn) => turn.text !== '' || turn.attachments !== undefined);
}

// --- Model labels -------------------------------------------------------------------------

/** Model whose label isn't readable (or empty). `hasThinkingSignal`: the UI shows thinking is on. */
export function unknownModel(name: string, hasThinkingSignal: boolean): ModelInfo {
  return {
    name,
    version: 'unknown',
    thinkingEffort: hasThinkingSignal ? THINKING_DETECTED_EFFORT : 'unknown',
    rawLabel: 'unknown',
  };
}

/**
 * Parses picker labels like "Claude 4.5 Sonnet" or "2.5 Flash Thinking" with a keyword table from
 * `config.json`. The version is the first number in the label.
 */
export function buildModelInfo(
  rawLabel: string,
  hasThinkingSignal: boolean,
  table: ModelKeywordConfig,
): ModelInfo {
  const label = rawLabel.trim();
  if (!label) return unknownModel(table.fallbackName, hasThinkingSignal);
  const lower = label.toLowerCase();

  const name =
    Object.entries(table.families).find(([, keywords]) =>
      keywords.some((keyword) => lower.includes(keyword)),
    )?.[0] ?? table.fallbackName;
  const version = label.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 'unknown';
  const thinks = hasThinkingSignal || table.thinkingKeywords.some((word) => lower.includes(word));

  return {
    name,
    version,
    thinkingEffort: thinks ? THINKING_DETECTED_EFFORT : familyDefaultEffort(name),
    rawLabel: label,
  };
}
