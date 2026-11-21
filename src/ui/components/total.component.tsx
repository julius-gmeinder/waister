/**
 * Total: the summed token count, the headline number.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import { Coins } from 'lucide-react';
import { formatCount } from '../format.helpers';

interface TotalProps {
  /** `undefined` while loading. */
  totalTokens: number | undefined;
}

export function Total({ totalTokens }: TotalProps) {
  return (
    <div className="total">
      <Coins />
      <span className="total-value">{formatCount(totalTokens)}</span>
      <span>tokens</span>
    </div>
  );
}
