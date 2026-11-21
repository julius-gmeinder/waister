/**
 * TokenBar: one prompt's breakdown as a row of pills, one per non-zero category, each with a hover
 * label. Thin and muted in a History row, where several tiny categories merge into one "Other"
 * pill (`ui.history.otherSegmentShare`). Thick, with all six and hatched hidden segments, in the
 * PromptDetailModal.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { ui } from '../../config/config.json';
import type { TokenBreakdown } from '../../dto/token-estimate.dto';
import { formatCount } from '../format.helpers';
import { TOKEN_CATEGORIES } from './token-category.helpers';

interface TokenBarProps {
  breakdown: TokenBreakdown;
  size?: 'thin' | 'thick';
}

interface Segment {
  /** A breakdown field, or `other` for the merged tiny categories. */
  id: string;
  label: string;
  value: number;
  hidden: boolean;
}

/** The non-zero categories in TOKEN_CATEGORIES order, tiny ones merged when `mergeSmall`. */
function buildSegments(breakdown: TokenBreakdown, mergeSmall: boolean): Segment[] {
  const segments = TOKEN_CATEGORIES.filter(({ field }) => breakdown[field] > 0).map(
    ({ field, label, hidden }) => ({ id: field, label, value: breakdown[field], hidden }),
  );
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (!mergeSmall || total <= 0) return segments;

  const small = segments.filter(({ value }) => value / total < ui.history.otherSegmentShare);
  // A single tiny category stays itself: merging it would only rename it.
  if (small.length < 2) return segments;
  const other: Segment = {
    id: 'other',
    label: `Other (${small.map(({ label }) => label).join(', ')})`,
    value: small.reduce((sum, segment) => sum + segment.value, 0),
    hidden: false,
  };
  return [...segments.filter((segment) => !small.includes(segment)), other];
}

export function TokenBar({ breakdown, size = 'thin' }: TokenBarProps) {
  const segments = buildSegments(breakdown, size === 'thin');
  const description = segments
    .map(({ label, value }) => `${label} ${formatCount(value)}`)
    .join(', ');

  return (
    <div
      className={`token-bar token-bar--${size}`}
      role="img"
      aria-label={segments.length ? `Token breakdown: ${description}` : 'No tokens'}
    >
      {segments.map(({ id, label, value, hidden }) => (
        <span
          key={id}
          className={`token-bar-segment token-bar-segment--${id}${hidden ? ' token-bar-segment--hidden' : ''}`}
          style={{ flexGrow: value }}
          data-label={`${label} · ${formatCount(value)}`}
        />
      ))}
    </div>
  );
}
