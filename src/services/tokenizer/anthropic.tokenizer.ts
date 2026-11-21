/**
 * Heuristic Claude tokenizer. Anthropic publishes no vocabulary. Calibrated to ~3.7 chars/token on
 * English, a bit denser than OpenAI's `o200k_base`.
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service
 */

export function countAnthropicTextTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const segments = trimmed.match(/[A-Za-z]+|\d{1,3}|[^\sA-Za-z\d]+/g) ?? [];

  let tokenCount = 0;
  for (const segment of segments) {
    if (/^[A-Za-z]+$/.test(segment)) {
      // Claude splits words > 5 characters slightly more often than o200k_base
      tokenCount += segment.length <= 5 ? 1 : Math.ceil(segment.length / 3.8);
    } else if (/^\d+$/.test(segment)) {
      tokenCount += 1;
    } else {
      tokenCount += Math.max(1, Math.ceil(segment.length / 1.8));
    }
  }

  return Math.max(1, tokenCount);
}
