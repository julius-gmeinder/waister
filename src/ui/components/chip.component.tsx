/**
 * Chip: a pill-shaped toggle button (aria-pressed). The selected chip is yellow. Used inside a
 * ChipGroup by the TimeframePicker and the ProviderFilter.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { ReactNode } from 'react';

interface ChipProps {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function Chip({ pressed, onClick, children }: ChipProps) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}
