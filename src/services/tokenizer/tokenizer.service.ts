/**
 * TokenizerService: counts the visible tokens (input, history, output) per provider.
 *
 * Every chat turn is wrapped in control tokens (ChatML `<|im_start|>`, Claude turn tags, Gemini
 * `<start_of_turn>`), so each input/history turn adds `turnFramingTokens` from
 * `tokenizer-lookup.json`. Attachments (images, files) add a fixed estimate per attachment from
 * the same file. The provider tokenizers ignore whitespace, so line breaks and indentation runs
 * are added here (~1 token per run, like real BPE vocabularies).
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service, docs/pipeline.md
 */

import type {
  AttachmentKind,
  ChatCaptureDto,
  ChatTurn,
  Provider,
} from '../../dto/chat-capture.dto';
import { countAnthropicTextTokens } from './anthropic.tokenizer';
import { countGoogleTextTokens } from './google.tokenizer';
import { countOpenAiTextTokens } from './openai.tokenizer';
import tokenizerLookup from './tokenizer-lookup.json';

export interface VisibleTokenizationResult {
  /** Incl. turn framing and attachments. */
  input: number;
  /** Incl. turn framing and attachments per turn. */
  history: number;
  /** Answer text + artifact / canvas document. */
  output: number;
  /** True while the provider tokenizers are character-based approximations. */
  approximate: boolean;
}

interface ProviderLookup {
  turnFramingTokens: number;
  attachmentTokens: Record<AttachmentKind, number>;
}

function resolveProviderLookup(provider: Provider): ProviderLookup {
  const providers = tokenizerLookup.providers as Partial<Record<Provider, ProviderLookup>>;
  return providers[provider] ?? tokenizerLookup.defaults;
}

export function resolveTurnFramingTokens(provider: Provider): number {
  return resolveProviderLookup(provider).turnFramingTokens;
}

/** Newline runs + leading indentation runs (≥ 2 spaces or a tab), ~1 token each. */
export function countWhitespaceTokens(text: string): number {
  const newlineRuns = text.match(/\n+/g)?.length ?? 0;
  const indentRuns = text.match(/^(?: {2,}|\t+)/gm)?.length ?? 0;
  return newlineRuns + indentRuns;
}

export function countTextTokensForProvider(text: string, provider: Provider): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const whitespace = countWhitespaceTokens(trimmed);
  switch (provider) {
    case 'openai':
      return countOpenAiTextTokens(trimmed) + whitespace;
    case 'anthropic':
      return countAnthropicTextTokens(trimmed) + whitespace;
    case 'google':
      return countGoogleTextTokens(trimmed) + whitespace;
  }
}

export function countAttachmentTokens(
  attachments: readonly AttachmentKind[] | undefined,
  provider: Provider,
): number {
  if (!attachments?.length) return 0;
  const rates = resolveProviderLookup(provider).attachmentTokens;
  return attachments.reduce((sum, kind) => sum + rates[kind], 0);
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
  turnFramingTokens: number = tokenizerLookup.defaults.turnFramingTokens,
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
  turnFramingTokens: number = tokenizerLookup.defaults.turnFramingTokens,
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
