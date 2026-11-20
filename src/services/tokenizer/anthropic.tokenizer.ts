/**
 * Tokenizer for Anthropic models (Claude).
 *
 * Anthropic does not publish a public BPE vocabulary for Claude 3.5 / 3.7 / 4.x models.
 * Empirically, Claude's BPE tokenizer has a slightly smaller vocabulary than OpenAI's `o200k_base`,
 * averaging ~3.7 characters per token on English text and splitting compound words slightly more
 * aggressively (~3.8 chars per sub-token). Each turn in Claude's chat format also incurs ~5 role
 * framing tokens (`\n\nHuman:` / `\n\nAssistant:` or XML turn blocks).
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service
 */

/**
 * Estimates Claude token count for a single string using a Claude-calibrated BPE heuristic.
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
