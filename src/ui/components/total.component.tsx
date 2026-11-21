/**
 * Total: the summed token count, the popup's headline number.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import { Coins } from 'lucide-react';

interface TotalProps {
  /** `undefined` while loading. */
  totalTokens: number | undefined;
}

export function Total({ totalTokens }: TotalProps) {
  return (
    <section className="total">
      <Coins />
      <span className="total-value">{totalTokens?.toLocaleString() ?? '–'}</span>
      <span className="total-label">tokens</span>
    </section>
  );
}
