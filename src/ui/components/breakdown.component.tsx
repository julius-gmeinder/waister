/**
 * Breakdown: one row per breakdown part of totalTokens.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import type { TokenBreakdown } from '../../dto/token-estimate.dto';
import { BreakdownRow } from './breakdown-row.component';
import { TOKEN_CATEGORIES } from './token-category.helpers';

interface BreakdownProps {
  /** `undefined` while loading. */
  breakdown: TokenBreakdown | undefined;
}

export function Breakdown({ breakdown }: BreakdownProps) {
  return (
    <ul className="breakdown">
      {TOKEN_CATEGORIES.map(({ field, label, icon }) => (
        <BreakdownRow key={field} icon={icon} label={label} value={breakdown?.[field]} />
      ))}
    </ul>
  );
}
