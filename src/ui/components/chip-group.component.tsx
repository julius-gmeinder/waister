/**
 * ChipGroup: a labelled row of Chips that wraps when it runs out of space.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { ReactNode } from 'react';

interface ChipGroupProps {
  /** Accessible name of the group, e.g. "Timeframe". */
  label: string;
  children: ReactNode;
}

export function ChipGroup({ label, children }: ChipGroupProps) {
  return (
    <div className="chip-group" role="group" aria-label={label}>
      {children}
    </div>
  );
}
