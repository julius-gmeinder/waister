/**
 * Popup view: asks the database (GET_USAGE_SUMMARY) for the token usage of the last 24 hours and
 * renders the summed totalTokens, its breakdown (input, history, output, thinking, overhead) and
 * the prompt count into the `[data-field]` elements in `popup.html`. Token usage only.
 *
 * Icons: lucide. popup.html holds `<i data-lucide="name">` placeholders and renderIcons() swaps
 * them for inline SVGs. Only icons listed in POPUP_ICONS are bundled.
 *
 * Context: popup
 * Docs: docs/modules.md#popup
 */

import {
  Brain,
  Coins,
  createIcons,
  History,
  MessageSquare,
  MessageSquareText,
  Settings2,
} from 'lucide';
import type { UsageSummaryDto } from '../../dto/usage-summary.dto';
import type { GetUsageSummaryMessage, UsageSummaryResponse } from '../../messages/runtime-messages';

/** Rolling window the popup sums over. */
const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Every icon the popup uses. Add an icon here and use its kebab-case name in popup.html
 * (`MessageSquareText` → `data-lucide="message-square-text"`). Names missing here render nothing.
 */
const POPUP_ICONS = {
  Brain,
  Coins,
  History,
  MessageSquare,
  MessageSquareText,
  Settings2,
};

function renderIcons(): void {
  createIcons({ icons: POPUP_ICONS, attrs: { 'stroke-width': 2 } });
}

/**
 * Helper to write text content into a `[data-field="<name>"]` element in `popup.html`.
 */
function setField(field: string, value: string): void {
  const el = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
  if (el) {
    el.textContent = value;
  }
}

/**
 * Renders a `UsageSummaryDto` into the `[data-field]` placeholders in `popup.html`.
 */
export function renderUsageSummary(summary: UsageSummaryDto | null): void {
  if (!summary) {
    setField('promptCount', 'No data');
    return;
  }

  setField('totalTokens', summary.totalTokens.toLocaleString());
  setField(
    'promptCount',
    `${summary.promptCount.toLocaleString()} ${summary.promptCount === 1 ? 'prompt' : 'prompts'}`,
  );

  setField('input', summary.breakdown.input.toLocaleString());
  setField('history', summary.breakdown.history.toLocaleString());
  setField('output', summary.breakdown.output.toLocaleString());
  setField('thinking', summary.breakdown.thinking.toLocaleString());
  setField('overhead', summary.breakdown.overhead.toLocaleString());
}

/**
 * Called by entries/popup.entry.ts once the popup document is ready.
 * Renders Lucide icons and fetches the last 24 hours of token usage from the database.
 */
export async function initPopupView(): Promise<void> {
  renderIcons();

  const message: GetUsageSummaryMessage = {
    type: 'GET_USAGE_SUMMARY',
    payload: { sinceMs: Date.now() - USAGE_WINDOW_MS },
  };

  try {
    const response = (await chrome.runtime.sendMessage(message)) as
      UsageSummaryResponse | { error: string };
    renderUsageSummary('error' in response ? null : response);
  } catch {
    renderUsageSummary(null);
  }
}
