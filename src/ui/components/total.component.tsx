/**
 * Total: the summed token count, the headline number.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import { Coins } from 'lucide-react';
import { TokenCount } from './token-count.component';

interface TotalProps {
  /** `undefined` while loading. */
  totalTokens: number | undefined;
}

export function Total({ totalTokens }: TotalProps) {
  return (
    <div className="total">
      <Coins />
      <TokenCount value={totalTokens} size="large" />
    </div>
  );
}
