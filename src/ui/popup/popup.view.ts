/**
 * Popup view: asks the background for the active tab's latest estimate (GET_LATEST_ESTIMATE)
 * and renders totalTokens, its breakdown, and the environmental impact (energy, water) into
 * the `[data-field]` elements in `popup.html`.
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
  Cpu,
  createIcons,
  Droplet,
  History,
  MessageSquare,
  MessageSquareText,
  Settings2,
  Timer,
  Zap,
} from 'lucide';
import type { TokenEstimateDto } from '../../dto/token-estimate.dto';
import type { GetLatestEstimateMessage } from '../../messages/runtime-messages';

/**
 * Every icon the popup uses. Add an icon here and use its kebab-case name in popup.html
 * (`MessageSquareText` → `data-lucide="message-square-text"`). Names missing here render nothing.
 */
const POPUP_ICONS = {
  Brain,
  Coins,
  Cpu,
  Droplet,
  History,
  MessageSquare,
  MessageSquareText,
  Settings2,
  Timer,
  Zap,
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
 * Renders a `TokenEstimateDto` into the `[data-field]` placeholders in `popup.html`.
 */
export function renderEstimate(estimate: TokenEstimateDto | null): void {
  if (!estimate) {
    return;
  }

  setField('totalTokens', estimate.totalTokens.toLocaleString());
  setField('model', `${estimate.model.name} (${estimate.model.version})`);
  setField('latencyMs', `${estimate.timings.latencyMs.toLocaleString()} ms`);

  setField('input', estimate.breakdown.input.toLocaleString());
  setField('history', estimate.breakdown.history.toLocaleString());
  setField('output', estimate.breakdown.output.toLocaleString());
  setField('thinking', estimate.breakdown.thinking.toLocaleString());
  setField('overhead', estimate.breakdown.overhead.toLocaleString());

  setField('energyWh', `${estimate.impact.energyWh} Wh`);
  setField('waterMl', `${estimate.impact.waterMl} mL`);
}

/**
 * Called by entries/popup.entry.ts once the popup document is ready.
 * Renders Lucide icons and fetches the latest estimate for the active tab.
 */
export async function initPopupView(): Promise<void> {
  renderIcons();

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTabId = tabs[0]?.id;

    const message: GetLatestEstimateMessage = {
      type: 'GET_LATEST_ESTIMATE',
      payload: { tabId: activeTabId },
    };

    const estimate = (await chrome.runtime.sendMessage(message)) as TokenEstimateDto | null;
    renderEstimate(estimate);
  } catch {
    renderEstimate(null);
  }
}
