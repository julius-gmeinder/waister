/**
 * TokenizerService: counts the **visible** tokens (`input`, `history`, `output`) with the
 * provider-specific tokenizers. Per-turn framing tokens come from `tokenizer-lookup.json`.
 * Hidden tokens (thinking, overhead) are estimated by EstimationService, not here.
 *
 * Why sites/providers differ for input, output, and chatHistory:
 *   1. Different sub-word vocabularies:
 *      - ChatGPT (`openai`) uses Tiktoken BPE (`o200k_base`, ~200k vocab, ~4.0 chars/token).
 *      - Claude (`anthropic`) uses a denser BPE (~3.7 chars/token, ~6-8% more tokens for the same text).
 *      - Gemini (`google`) uses SentencePiece Unigram (256k vocab, ~4.1 chars/token).
 *   2. Turn framing overhead in `chatHistory` and `userInput`:
 *      - Every message turn sent to an LLM is wrapped in special control tokens
 *        (e.g. ChatGPT `<|im_start|>user...<|im_end|>`, Claude turn tags, Gemini `<start_of_turn>`).
 *      - That adds `turnFramingTokens` (4-5 tokens) per turn in `chatHistory` plus the current input/output.
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service, docs/pipeline.md
 */

import type { ChatCaptureDto, ChatTurn, Provider } from '../../dto/chat-capture.dto';
import { countAnthropicTextTokens } from './anthropic.tokenizer';
import { countGoogleTextTokens } from './google.tokenizer';
import { countOpenAiTextTokens } from './openai.tokenizer';
import tokenizerLookup from './tokenizer-lookup.json';

/**
 * Visible token counts returned by `countVisibleTokens` to `estimation.handler.ts`.
 */
export interface VisibleTokenizationResult {
  /** Tokens of the new user message, incl. turn framing. */
  input: number;
  /** Tokens of all earlier turns, incl. turn framing per turn. */
  history: number;
  /** Tokens of the visible answer. */
  output: number;
  /** True while the provider tokenizers are character-based approximations. */
  approximate: boolean;
}

/**
 * Per-turn chat-template framing tokens for `provider` from `tokenizer-lookup.json`.
 */
export function resolveTurnFramingTokens(provider: Provider): number {
  const providers = tokenizerLookup.providers as Partial<
    Record<Provider, { turnFramingTokens: number }>
  >;
  return providers[provider]?.turnFramingTokens ?? tokenizerLookup.defaults.turnFramingTokens;
}

/**
 * Routes a plain text string to the appropriate provider's tokenizer function.
 */
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

/**
 * Estimates the token count of the current user prompt (`userInput`), including the provider's
 * single-turn chat framing tokens (e.g. role header/footer tokens).
 */
export function countInputTokens(
  userInput: string,
  provider: Provider,
  turnFramingTokens: number = tokenizerLookup.defaults.turnFramingTokens,
): number {
  const textTokens = countTextTokensForProvider(userInput, provider);
  return textTokens > 0 ? textTokens + turnFramingTokens : 0;
}

/**
 * Estimates the token count of the assistant's visible response (`response`).
 */
export function countOutputTokens(response: string, provider: Provider): number {
  return countTextTokensForProvider(response, provider);
}

/**
 * Estimates the total token count of all earlier conversation turns (`chatHistory[]`).
 * Because LLM chat web apps re-send the prior conversation turns as context on every new prompt,
 * each turn is tokenized with the provider's tokenizer plus its per-turn framing overhead.
 */
export function countHistoryTokens(
  chatHistory: readonly ChatTurn[],
  provider: Provider,
  turnFramingTokens: number = tokenizerLookup.defaults.turnFramingTokens,
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

/**
 * Full visible tokenization pass over a `ChatCaptureDto`: tokenizes `userInput`, `response` and
 * `chatHistory[]` with the provider-specific tokenizer. Hidden tokens (thinking, overhead) are
 * estimated by EstimationService.
 */
export function countVisibleTokens(capture: ChatCaptureDto): VisibleTokenizationResult {
  const turnFramingTokens = resolveTurnFramingTokens(capture.provider);
  return {
    input: countInputTokens(capture.userInput, capture.provider, turnFramingTokens),
    history: countHistoryTokens(capture.chatHistory, capture.provider, turnFramingTokens),
    output: countOutputTokens(capture.response, capture.provider),
    approximate: true,
  };
}
