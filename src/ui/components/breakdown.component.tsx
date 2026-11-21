/**
 * Breakdown: one row per part of totalTokens (input, history, output, thinking, tools, overhead).
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import {
  Brain,
  History,
  MessageSquare,
  MessageSquareText,
  Settings2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { TokenBreakdown } from '../../dto/token-estimate.dto';
import { BreakdownRow } from './breakdown-row.component';

/** Row order and icons. Icon list: docs/styling.md#icons. */
const ROWS: { field: keyof TokenBreakdown; label: string; icon: LucideIcon }[] = [
  { field: 'input', label: 'Input', icon: MessageSquare },
  { field: 'history', label: 'History', icon: History },
  { field: 'output', label: 'Output', icon: MessageSquareText },
  { field: 'thinking', label: 'Thinking', icon: Brain },
  { field: 'tools', label: 'Tools', icon: Wrench },
  { field: 'overhead', label: 'Overhead', icon: Settings2 },
];

interface BreakdownProps {
  /** `undefined` while loading. */
  breakdown: TokenBreakdown | undefined;
}

export function Breakdown({ breakdown }: BreakdownProps) {
  return (
    <ul className="breakdown">
      {ROWS.map(({ field, label, icon }) => (
        <BreakdownRow key={field} icon={icon} label={label} value={breakdown?.[field]} />
      ))}
    </ul>
  );
}
