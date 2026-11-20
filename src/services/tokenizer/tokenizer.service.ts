/**
 * TokenizerService: counts visible tokens (`input`, `output`, `history`) using provider-specific
 * tokenizers AND looks up hidden tokens (`overhead` for system prompt and `thinking` from
 * `thinkingTimeMs`) using `tokenizer-lookup.json` in this same folder.
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

import type {
  ChatCaptureDto,
  ChatTurn,
  ModelInfo,
  Provider,
  ThinkingEffort,
} from '../../dto/chat-capture.dto';
import type { TokenBreakdown } from '../../dto/token-estimate.dto';
import { countAnthropicTextTokens } from './anthropic.tokenizer';
import { countGoogleTextTokens } from './google.tokenizer';
import { countOpenAiTextTokens } from './openai.tokenizer';
import tokenizerLookup from './tokenizer-lookup.json';

/**
 * Resolved lookup configuration for a specific provider + model from `tokenizer-lookup.json`.
 */
export interface TokenizerLookupEntry {
  /** Base hidden system prompt & tool-definition token count. */
  systemPromptTokens: number;
  /** How many thinking tokens are generated per 1 millisecond of `thinkingTimeMs`. */
  tokensPerMsThinking: number;
  /** Per-turn framing control tokens added by the provider's chat template. */
  turnFramingTokens: number;
  /** Whether an exact model entry was found in `tokenizer-lookup.json` (false if fallback). */
  exactModelMatch: boolean;
}

/**
 * Result returned by `tokenizeCapture` to `estimation.handler.ts`.
 */
export interface TokenizationResult {
  /** Per-category token counts (input, history, output, thinking, overhead). */
  breakdown: TokenBreakdown;
  /** Total tokens across all visible and hidden categories. */
  totalTokens: number;
  /** True if heuristic tokenization or a fallback model lookup entry was used. */
  approximate: boolean;
}

/**
 * Resolves the lookup parameters (`systemPromptTokens`, `tokensPerMsThinking`, `turnFramingTokens`)
 * for a given `provider` and `model` from `tokenizer-lookup.json`.
 */
export function resolveTokenizerLookup(provider: Provider, model: ModelInfo): TokenizerLookupEntry {
  const providerTable = tokenizerLookup.providers[provider];
  if (!providerTable) {
    return {
      systemPromptTokens: tokenizerLookup.defaults.systemPromptTokens,
      tokensPerMsThinking: tokenizerLookup.defaults.tokensPerMsThinking,
      turnFramingTokens: tokenizerLookup.defaults.turnFramingTokens,
      exactModelMatch: false,
    };
  }

  const modelsMap = providerTable.models as Record<
    string,
    { systemPromptTokens: number; tokensPerMsThinking: number } | undefined
  >;
  const modelEntry = modelsMap[model.name];

  return {
    systemPromptTokens: modelEntry?.systemPromptTokens ?? providerTable.default.systemPromptTokens,
    tokensPerMsThinking:
      modelEntry?.tokensPerMsThinking ?? providerTable.default.tokensPerMsThinking,
    turnFramingTokens: providerTable.default.turnFramingTokens,
    exactModelMatch: modelEntry !== undefined,
  };
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
 * Estimates hidden thinking/reasoning tokens from `thinkingTimeMs` (the delta time between t0
 * prompt send and start of the visible stream) using the `tokensPerMsThinking` factor and the
 * model's `thinkingEffort` multiplier from `tokenizer-lookup.json`.
 */
export function estimateThinkingTokensFromTime(
  thinkingTimeMs: number,
  tokensPerMsThinking: number,
  thinkingEffort: ThinkingEffort,
): number {
  if (thinkingTimeMs <= 0) return 0;

  const effortMultipliers = tokenizerLookup.defaults.effortMultipliers as Record<
    ThinkingEffort,
    number
  >;
  const effortMultiplier = effortMultipliers[thinkingEffort] ?? 0.5;

  // Subtract a small baseline network/TTFT handshake (250ms) so pure network ping isn't counted as reasoning
  const effectiveThinkingMs = Math.max(0, thinkingTimeMs - 250);
  return Math.round(effectiveThinkingMs * tokensPerMsThinking * effortMultiplier);
}

/**
 * Full tokenization pass over a `ChatCaptureDto`:
 * 1. Looks up `systemPromptTokens`, `tokensPerMsThinking`, and `turnFramingTokens` in `tokenizer-lookup.json`.
 * 2. Tokenizes `userInput`, `response`, and `chatHistory[]` using the provider-specific tokenizer.
 * 3. Computes hidden `thinking` tokens from `capture.thinkingTimeMs` and hidden `overhead` tokens.
 * 4. Sums all categories into `totalTokens`.
 */
export function tokenizeCapture(capture: ChatCaptureDto): TokenizationResult {
  const lookup = resolveTokenizerLookup(capture.provider, capture.model);

  const input = countInputTokens(capture.userInput, capture.provider, lookup.turnFramingTokens);
  const output = countOutputTokens(capture.response, capture.provider);
  const history = countHistoryTokens(
    capture.chatHistory,
    capture.provider,
    lookup.turnFramingTokens,
  );
  const thinking = estimateThinkingTokensFromTime(
    capture.thinkingTimeMs,
    lookup.tokensPerMsThinking,
    capture.model.thinkingEffort,
  );
  const overhead = lookup.systemPromptTokens;

  const totalTokens = input + history + output + thinking + overhead;

  return {
    breakdown: {
      input,
      history,
      output,
      thinking,
      overhead,
    },
    totalTokens,
    approximate: true,
  };
}
