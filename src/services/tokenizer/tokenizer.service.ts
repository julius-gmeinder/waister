/**
 * TokenizerService: counts the visible tokens (input, history, output) per provider.
 * The heuristic tokenizers ignore whitespace, so newline and indentation runs are added back here.
 * Each input/history turn also gets the chat-template framing tokens. The new answer gets none.
 * That is an assumption: its end-of-turn token is not counted, while a history turn is re-sent
 * wrapped in the full template.
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service, docs/pipeline.md
 */

import { tokenizer } from '../../config/config.json';
import type { TokenizerConfig } from '../../config/config.types';
import type {
  AttachmentKind,
  ChatCaptureDto,
  ChatTurn,
  Provider,
} from '../../dto/chat-capture.dto';
import { createHeuristicTokenizer } from './heuristic.tokenizer';

const TOKENIZER_CONFIG: TokenizerConfig = tokenizer;

const COUNTERS: Record<Provider, (text: string) => number> = {
  openai: createHeuristicTokenizer(TOKENIZER_CONFIG.openai),
  anthropic: createHeuristicTokenizer(TOKENIZER_CONFIG.anthropic),
  google: createHeuristicTokenizer(TOKENIZER_CONFIG.google),
};

const { newlineRunTokens, indentRunTokens, indentMinSpaces } = TOKENIZER_CONFIG.whitespace;
const NEWLINE_RUN = /\n+/g;
const INDENT_RUN = new RegExp(`^(?: {${indentMinSpaces},}|\\t+)`, 'gm');

export interface VisibleTokenizationResult {
  /** Incl. turn framing and attachments. */
  input: number;
  /** Incl. turn framing and attachments per turn. */
  history: number;
  /** Answer text + artifact / canvas document. */
  output: number;
  /** Constant for now: every provider tokenizer is a heuristic. */
  approximate: boolean;
}

export function resolveTurnFramingTokens(provider: Provider): number {
  return TOKENIZER_CONFIG[provider].turnFramingTokens;
}

/** Newline runs and leading indentation runs, weighted by `tokenizer.whitespace`. */
export function countWhitespaceTokens(text: string): number {
  const newlineRuns = text.match(NEWLINE_RUN)?.length ?? 0;
  const indentRuns = text.match(INDENT_RUN)?.length ?? 0;
  return newlineRuns * newlineRunTokens + indentRuns * indentRunTokens;
}

export function countTextTokensForProvider(text: string, provider: Provider): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return COUNTERS[provider](trimmed) + countWhitespaceTokens(trimmed);
}

export function countAttachmentTokens(
  attachments: readonly AttachmentKind[] | undefined,
  provider: Provider,
): number {
  if (!attachments?.length) return 0;
  const rates = TOKENIZER_CONFIG[provider].attachmentTokens;
  // `?? 0`: a kind that crossed the message boundary may have no rate, and NaN would make the
  // SQLite insert fail and lose the prompt.
  return attachments.reduce((sum, kind) => sum + (rates[kind] ?? 0), 0);
}

/** One turn: text + attachments + framing (no framing for an empty turn). */
function countTurnTokens(
  text: string,
  attachments: readonly AttachmentKind[] | undefined,
  provider: Provider,
  turnFramingTokens: number,
): number {
  const content =
    countTextTokensForProvider(text, provider) + countAttachmentTokens(attachments, provider);
  return content > 0 ? content + turnFramingTokens : 0;
}

export function countInputTokens(
  userInput: string,
  provider: Provider,
  turnFramingTokens: number = resolveTurnFramingTokens(provider),
  attachments: readonly AttachmentKind[] = [],
): number {
  return countTurnTokens(userInput, attachments, provider, turnFramingTokens);
}

export function countOutputTokens(
  response: string,
  provider: Provider,
  artifactText: string = '',
): number {
  return (
    countTextTokensForProvider(response, provider) +
    countTextTokensForProvider(artifactText, provider)
  );
}

export function countHistoryTokens(
  chatHistory: readonly ChatTurn[],
  provider: Provider,
  turnFramingTokens: number = resolveTurnFramingTokens(provider),
): number {
  let total = 0;
  for (const turn of chatHistory) {
    total += countTurnTokens(turn.text, turn.attachments, provider, turnFramingTokens);
  }
  return total;
}

export function countVisibleTokens(capture: ChatCaptureDto): VisibleTokenizationResult {
  const turnFramingTokens = resolveTurnFramingTokens(capture.provider);
  return {
    input: countInputTokens(
      capture.userInput,
      capture.provider,
      turnFramingTokens,
      capture.userAttachments,
    ),
    history: countHistoryTokens(capture.chatHistory, capture.provider, turnFramingTokens),
    output: countOutputTokens(capture.response, capture.provider, capture.artifactText),
    approximate: true,
  };
}
