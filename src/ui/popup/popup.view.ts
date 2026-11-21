/**
 * Popup view: renders the last 24h of token usage from the database into `popup.html`.
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

const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Only these icons are bundled. popup.html uses the kebab-case name
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

function setField(field: string, value: string): void {
  const el = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
  if (el) {
    el.textContent = value;
  }
}

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
