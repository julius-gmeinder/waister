/**
 * Heuristic Gemini tokenizer, approximating its SentencePiece unigram model (256k vocab,
 * ~4.1 chars/token on prose).
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service
 */

export function countGoogleTextTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const segments = trimmed.match(/[A-Za-z]+|\d{1,4}|[^\sA-Za-z\d]+/g) ?? [];

  let tokenCount = 0;
  for (const segment of segments) {
    if (/^[A-Za-z]+$/.test(segment)) {
      // The large vocab keeps words up to ~7 chars as a single piece
      tokenCount += segment.length <= 7 ? 1 : Math.ceil(segment.length / 4.3);
    } else if (/^\d+$/.test(segment)) {
      tokenCount += 1;
    } else {
      tokenCount += Math.max(1, Math.ceil(segment.length / 2.2));
    }
  }

  return Math.max(1, tokenCount);
}
