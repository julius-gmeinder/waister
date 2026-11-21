/**
 * Token category helpers: label, icon and visibility of the six TokenBreakdown parts, in display
 * order. Shared by the Breakdown, the TokenBar and the PromptDetailModal, so they never disagree.
 *
 * Context: popup, app page
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

export interface TokenCategory {
  field: keyof TokenBreakdown;
  label: string;
  icon: LucideIcon;
  /** Visible = counted from the page. Hidden = estimated, never shown on the page. */
  hidden: boolean;
}

/**
 * Visible parts first, then hidden. The TokenBar stacks them in this order, and the colors
 * (`--token-<field>`, base.css) were validated as neighbors in exactly this order. Icons:
 * docs/styling.md#icons.
 */
export const TOKEN_CATEGORIES: readonly TokenCategory[] = [
  { field: 'input', label: 'Input', icon: MessageSquare, hidden: false },
  { field: 'history', label: 'History', icon: History, hidden: false },
  { field: 'output', label: 'Output', icon: MessageSquareText, hidden: false },
  { field: 'thinking', label: 'Thinking', icon: Brain, hidden: true },
  { field: 'tools', label: 'Tools', icon: Wrench, hidden: true },
  { field: 'overhead', label: 'Overhead', icon: Settings2, hidden: true },
];
