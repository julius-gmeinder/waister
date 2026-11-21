/**
 * Character-based heuristic tokenizer shared by the provider tokenizers. Each provider passes its
 * parameters from `config.json` (`tokenizer.<provider>`).
 *
 * Text is split into letter runs, digit chunks and symbol runs:
 * - a word up to `singleTokenMaxWordLength` letters is 1 token, longer ones count
 *   `ceil(length / charsPerSubword)`
 * - each chunk of up to `digitChunkSize` digits is 1 token
 * - a symbol run counts `max(1, ceil(length / charsPerSymbolToken))`
 *
 * Context: background
 * Docs: docs/modules.md#tokenizer-service
 */

import type { HeuristicTokenizerConfig } from '../../config/config.types';

const WORD = /^[A-Za-z]+$/;
const DIGITS = /^\d+$/;

export function createHeuristicTokenizer(
  params: HeuristicTokenizerConfig,
): (text: string) => number {
  const segmentPattern = new RegExp(
    `[A-Za-z]+|\\d{1,${params.digitChunkSize}}|[^\\sA-Za-z\\d]+`,
    'g',
  );

  return (text: string): number => {
    const trimmed = text.trim();
    if (!trimmed) return 0;

    const segments = trimmed.match(segmentPattern) ?? [];

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

    return Math.max(1, tokenCount);
  };
}
