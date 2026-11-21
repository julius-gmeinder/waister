/**
 * TokenCount: a token number in the one look every token figure shares (serif, `--tokens` color),
 * optionally followed by a muted "tokens" unit. Sizes differ per place, the look doesn't. An
 * approximate count explains itself on hover.
 *
 * Context: popup | app page
 * Docs: docs/modules.md#ui
 */

import { formatCount } from '../format.helpers';

/** `inline` follows the surrounding font size (sentences, rows, legends). */
export type TokenCountSize = 'inline' | 'large' | 'hero';

interface TokenCountProps {
  /** `undefined` while loading. */
  value: number | undefined;
  size?: TokenCountSize;
  /** Show the "tokens" unit after the number. Off in lists whose heading already says tokens. */
  unit?: boolean;
  /** Heuristic tokenizer or fallback model profile: says so on hover instead of a badge. */
  approximate?: boolean;
}

const APPROXIMATE_NOTE =
  'Approximate: a heuristic tokenizer or a fallback model profile was used for this estimate';

export function TokenCount({
  value,
  size = 'inline',
  unit = true,
  approximate = false,
}: TokenCountProps) {
  return (
    <span
      className={`token-count token-count--${size}${approximate ? ' token-count--approximate' : ''}`}
      title={approximate ? APPROXIMATE_NOTE : undefined}
    >
      <span className="token-count-value">{formatCount(value)}</span>
      {unit && <span className="token-count-unit">{value === 1 ? 'token' : 'tokens'}</span>}
    </span>
  );
}
