/**
 * BreakdownRow: icon, label and token count of one breakdown part.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import type { LucideIcon } from 'lucide-react';
import { formatCount } from '../format.helpers';

interface BreakdownRowProps {
  icon: LucideIcon;
  label: string;
  /** `undefined` while loading. */
  value: number | undefined;
}

export function BreakdownRow({ icon: Icon, label, value }: BreakdownRowProps) {
  return (
    <li className="breakdown-row">
      <Icon />
      <span>{label}</span>
      <span className="breakdown-value">{formatCount(value)}</span>
    </li>
  );
}
