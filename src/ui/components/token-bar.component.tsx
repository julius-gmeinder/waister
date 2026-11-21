/**
 * TokenBar: one prompt's breakdown as a stacked bar, a segment per non-zero category. Thin in a
 * History row, thick (with hatched hidden segments) in the PromptDetailModal.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { TokenBreakdown } from '../../dto/token-estimate.dto';
import { formatCount } from '../format.helpers';
import { TOKEN_CATEGORIES } from './token-category.helpers';

interface TokenBarProps {
  breakdown: TokenBreakdown;
  size?: 'thin' | 'thick';
}

export function TokenBar({ breakdown, size = 'thin' }: TokenBarProps) {
  const parts = TOKEN_CATEGORIES.filter(({ field }) => breakdown[field] > 0);
  const description = parts
    .map(({ field, label }) => `${label} ${formatCount(breakdown[field])}`)
    .join(', ');

  return (
    <div
      className={`token-bar token-bar--${size}`}
      role="img"
      aria-label={parts.length ? `Token breakdown: ${description}` : 'No tokens'}
    >
      {parts.map(({ field, label, hidden }) => (
        <span
          key={field}
          className={`token-bar-segment token-bar-segment--${field}${hidden ? ' token-bar-segment--hidden' : ''}`}
          style={{ flexGrow: breakdown[field] }}
          title={`${label}: ${formatCount(breakdown[field])} tokens`}
        />
      ))}
    </div>
  );
}
