/**
 * Heuristic tokenizer approximating tiktoken's `o200k_base` (~4.0 chars/token on English prose).
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service
 */

export function countOpenAiTextTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  // Digits in 1-3 chunks, like o200k_base splits numbers
  const segments = trimmed.match(/[A-Za-z]+|\d{1,3}|[^\sA-Za-z\d]+/g) ?? [];

  let tokenCount = 0;
  for (const segment of segments) {
    if (/^[A-Za-z]+$/.test(segment)) {
      // Short words are 1 token, longer ones split into ~4.2-char subwords
      tokenCount += segment.length <= 6 ? 1 : Math.ceil(segment.length / 4.2);
    } else if (/^\d+$/.test(segment)) {
      tokenCount += 1;
    } else {
      tokenCount += Math.max(1, Math.ceil(segment.length / 2));
    }
  }

  return Math.max(1, tokenCount);
}
