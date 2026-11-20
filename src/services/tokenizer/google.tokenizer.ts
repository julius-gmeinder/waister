/**
 * Tokenizer for Google models (Gemini).
 *
 * Gemini uses a SentencePiece unigram tokenizer with a large multilingual vocabulary (256k tokens).
 * Because SentencePiece encodes leading spaces (` `) as part of word pieces and has a large vocab,
 * Gemini averages ~4.1 characters per token on prose and packs common multi-character punctuation
 * efficiently. Each conversation turn adds ~4 turn-delimiter tokens (`<start_of_turn>user...<end_of_turn>`).
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service
 */

/**
 * Estimates Gemini token count for a single string using a SentencePiece-calibrated heuristic.
 */
export function countGoogleTextTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const segments = trimmed.match(/[A-Za-z]+|\d{1,4}|[^\sA-Za-z\d]+/g) ?? [];

  let tokenCount = 0;
  for (const segment of segments) {
    if (/^[A-Za-z]+$/.test(segment)) {
      // SentencePiece 256k vocab keeps words up to 7 chars as a single piece more often
      tokenCount += segment.length <= 7 ? 1 : Math.ceil(segment.length / 4.3);
    } else if (/^\d+$/.test(segment)) {
      tokenCount += 1;
    } else {
      tokenCount += Math.max(1, Math.ceil(segment.length / 2.2));
    }
  }

  return Math.max(1, tokenCount);
}
