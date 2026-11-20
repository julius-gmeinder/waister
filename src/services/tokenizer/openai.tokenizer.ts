/**
 * Tokenizer for OpenAI models (ChatGPT).
 *
 * OpenAI models (GPT-4o, GPT-4.5, o1/o3/o4) use Tiktoken (`o200k_base` / `cl100k_base` BPE).
 * In `o200k_base`, English prose averages ~4.0 characters per token (~0.75 words/token), while
 * whitespace-delimited words, punctuation, digits, and code symbols split into separate BPE tokens.
 * Furthermore, ChatGPT wraps every chat turn in ChatML tokens (`<|im_start|>role\n...<|im_end|>\n`),
 * which adds ~4 framing tokens per message turn.
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service
 */

/**
 * Counts tokens for a single plain-text string using an `o200k_base`-calibrated BPE heuristic:
 * - Splits text into words, numbers, punctuation runs, and CJK/emoji characters.
 * - Long words (> 6 chars) are split into sub-word BPE pieces (~4.2 chars per sub-token).
 * - Numbers are grouped in 1-3 digit chunks (matching `o200k_base` digit splitting).
 */
export function countOpenAiTextTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  // Match words, 1-3 digit number chunks, punctuation runs, or non-ASCII/emoji characters
  const segments = trimmed.match(/[A-Za-z]+|\d{1,3}|[^\sA-Za-z\d]+/g) ?? [];

  let tokenCount = 0;
  for (const segment of segments) {
    if (/^[A-Za-z]+$/.test(segment)) {
      // Short common words are 1 BPE token; longer words split into ~4.2-char subwords
      tokenCount += segment.length <= 6 ? 1 : Math.ceil(segment.length / 4.2);
    } else if (/^\d+$/.test(segment)) {
      tokenCount += 1;
    } else {
      // Punctuation / code operators / multibyte symbols
      tokenCount += Math.max(1, Math.ceil(segment.length / 2));
    }
  }

  return Math.max(1, tokenCount);
}
