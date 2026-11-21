/**
 * TokenizerService: counts the visible tokens (input, history, output) per provider.
 *
 * Every chat turn is wrapped in control tokens (ChatML `<|im_start|>`, Claude turn tags, Gemini
 * `<start_of_turn>`), so each input/history turn adds `turnFramingTokens` from `config.json`
 * (`tokenizer.<provider>`).
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service, docs/pipeline.md
 */

import { tokenizer } from '../../config/config.json';
import type { TokenizerConfig } from '../../config/config.types';
import type { ChatCaptureDto, ChatTurn, Provider } from '../../dto/chat-capture.dto';
import { countAnthropicTextTokens } from './anthropic.tokenizer';
import { countGoogleTextTokens } from './google.tokenizer';
import { countOpenAiTextTokens } from './openai.tokenizer';

const TOKENIZER_CONFIG: TokenizerConfig = tokenizer;

export interface VisibleTokenizationResult {
  /** Incl. turn framing. */
  input: number;
  /** Incl. turn framing per turn. */
  history: number;
  output: number;
  /** True while the provider tokenizers are character-based approximations. */
  approximate: boolean;
}

export function resolveTurnFramingTokens(provider: Provider): number {
  return TOKENIZER_CONFIG[provider].turnFramingTokens;
}

export function countTextTokensForProvider(text: string, provider: Provider): number {
  switch (provider) {
    case 'openai':
      return countOpenAiTextTokens(text);
    case 'anthropic':
      return countAnthropicTextTokens(text);
    case 'google':
      return countGoogleTextTokens(text);
  }
}

export function countInputTokens(
  userInput: string,
  provider: Provider,
  turnFramingTokens: number = resolveTurnFramingTokens(provider),
): number {
  const textTokens = countTextTokensForProvider(userInput, provider);
  return textTokens > 0 ? textTokens + turnFramingTokens : 0;
}

export function countOutputTokens(response: string, provider: Provider): number {
  return countTextTokensForProvider(response, provider);
}

export function countHistoryTokens(
  chatHistory: readonly ChatTurn[],
  provider: Provider,
  turnFramingTokens: number = resolveTurnFramingTokens(provider),
): number {
  let total = 0;
  for (const turn of chatHistory) {
    const turnTextTokens = countTextTokensForProvider(turn.text, provider);
    if (turnTextTokens > 0) {
      total += turnTextTokens + turnFramingTokens;
    }
  }
  return total;
}

export function countVisibleTokens(capture: ChatCaptureDto): VisibleTokenizationResult {
  const turnFramingTokens = resolveTurnFramingTokens(capture.provider);
  return {
    input: countInputTokens(capture.userInput, capture.provider, turnFramingTokens),
    history: countHistoryTokens(capture.chatHistory, capture.provider, turnFramingTokens),
    output: countOutputTokens(capture.response, capture.provider),
    approximate: true,
  };
}
