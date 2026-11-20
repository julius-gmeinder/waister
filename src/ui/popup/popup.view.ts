/**
 * Popup view: asks the background for the active tab's latest estimate (GET_LATEST_ESTIMATE)
 * and populates the elements in `popup.html` with `totalTokens`, the token breakdown, and
 * the energy/water usage from `TokenEstimateDto`.
 *
 * Context: popup
 * Docs: docs/modules.md#popup
 */

import type { TokenEstimateDto } from '../../dto/token-estimate.dto';
import type { GetLatestEstimateMessage } from '../../messages/runtime-messages';

/**
 * Helper to write text content into a DOM element by ID.
 */
function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

/**
 * Renders a `TokenEstimateDto` into `popup.html`.
 */
export function renderEstimate(estimate: TokenEstimateDto | null): void {
  const emptyState = document.getElementById('empty-state');
  const content = document.getElementById('estimate-content');

  if (!estimate) {
    if (emptyState) emptyState.hidden = false;
    if (content) content.hidden = true;
    return;
  }

  if (emptyState) emptyState.hidden = true;
  if (content) content.hidden = false;

  setText(
    'meta-model',
    `${estimate.provider} / ${estimate.model.name} (${estimate.model.version}, effort: ${estimate.model.thinkingEffort})`,
  );
  setText('total-tokens', estimate.totalTokens.toLocaleString());

  setText('tokens-input', estimate.breakdown.input.toLocaleString());
  setText('tokens-history', estimate.breakdown.history.toLocaleString());
  setText('tokens-output', estimate.breakdown.output.toLocaleString());
  setText('tokens-thinking', estimate.breakdown.thinking.toLocaleString());
  setText('tokens-overhead', estimate.breakdown.overhead.toLocaleString());

  setText('impact-energy', `${estimate.impact.energyWh} Wh`);
  setText('impact-water', `${estimate.impact.waterMl} mL`);
  setText('impact-co2', `${estimate.impact.co2Grams} gCO2e`);

  setText('timing-thinking', estimate.timings.thinkingTimeMs.toLocaleString());
  setText('timing-latency', estimate.timings.latencyMs.toLocaleString());
}

/**
 * Queries the active browser tab and requests its latest `TokenEstimateDto` from the background.
 */
export async function initPopupView(): Promise<void> {
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
