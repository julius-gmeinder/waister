/**
 * HeuristicTokenizer: character-based token counter, one instance per provider.
 * Text is split into letter runs, digit chunks and symbol runs, and each segment is costed from
 * `tokenizer.<provider>` (see `HeuristicTokenizerConfig`). Whitespace is ignored here, the
 * TokenizerService adds it back.
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service
 */

import type { HeuristicTokenizerConfig } from '../../config/config.types';

// Unicode-aware, so "für" or CJK text count as words instead of falling into the symbol branch.
// Combining marks (\p{M}) stay with the letters so decomposed accents don't split a word.
const WORD = /^[\p{L}\p{M}]+$/u;
const DIGITS = /^\p{N}+$/u;

export function createHeuristicTokenizer(
  params: HeuristicTokenizerConfig,
): (text: string) => number {
  const segmentPattern = new RegExp(
    `[\\p{L}\\p{M}]+|\\p{N}{1,${params.digitChunkSize}}|[^\\s\\p{L}\\p{M}\\p{N}]+`,
    'gu',
  );

  return (text: string): number => {
    // Blank text has no segments, so no trim is needed.
    const segments = text.match(segmentPattern) ?? [];

    let tokenCount = 0;
    for (const segment of segments) {
      if (WORD.test(segment)) {
        tokenCount +=
          segment.length <= params.singleTokenMaxWordLength
            ? 1
            : Math.ceil(segment.length / params.charsPerSubword);
      } else if (DIGITS.test(segment)) {
        tokenCount += 1;
      } else {
        tokenCount += Math.max(1, Math.ceil(segment.length / params.charsPerSymbolToken));
      }
    }

    return tokenCount;
  };
}
