/**
 * BreakdownRow: icon, label and token count of one breakdown part.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import type { LucideIcon } from 'lucide-react';

interface BreakdownRowProps {
  icon: LucideIcon;
  label: string;
  /** `undefined` while loading. */
  value: number | undefined;
}

export function BreakdownRow({ icon: Icon, label, value }: BreakdownRowProps) {
  return (
    <li>
      <Icon />
      <span>{label}</span>
      <span className="breakdown-value">{value?.toLocaleString() ?? '–'}</span>
    </li>
  );
}
