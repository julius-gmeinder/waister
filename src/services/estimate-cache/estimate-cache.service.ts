/**
 * Keeps the latest TokenEstimateDto per tab in chrome.storage.session so the popup can read it
 * after the service worker has been stopped. Also stores a 'latest' fallback key so opening the
 * popup on any tab can still inspect the most recent prompt estimate.
 *
 * Context: background
 * Docs: docs/modules.md#estimate-cache-service
 */

import type { TokenEstimateDto } from '../../dto/token-estimate.dto';

const TAB_KEY_PREFIX = 'estimate:tab:';
const LATEST_FALLBACK_KEY = 'estimate:latest';

/**
 * Saves the latest `TokenEstimateDto` for a tab in `chrome.storage.session`.
 */
export async function setLatestEstimate(
  tabId: number | undefined,
  estimate: TokenEstimateDto,
): Promise<void> {
  if (!chrome?.storage?.session) return;

  const entries: Record<string, TokenEstimateDto> = {
    [LATEST_FALLBACK_KEY]: estimate,
  };
  if (typeof tabId === 'number') {
    entries[`${TAB_KEY_PREFIX}${tabId}`] = estimate;
  }

  await chrome.storage.session.set(entries);
}

/**
 * Retrieves the latest `TokenEstimateDto` for `tabId` (or falls back to the most recent
 * estimate across tabs if the active tab has no tab-specific entry).
 */
export async function getLatestEstimate(tabId?: number): Promise<TokenEstimateDto | null> {
  if (!chrome?.storage?.session) return null;

  if (typeof tabId === 'number') {
    const tabKey = `${TAB_KEY_PREFIX}${tabId}`;
    const result = await chrome.storage.session.get([tabKey, LATEST_FALLBACK_KEY]);
    const tabEstimate = result[tabKey] as TokenEstimateDto | undefined;
    if (tabEstimate) return tabEstimate;
    return (result[LATEST_FALLBACK_KEY] as TokenEstimateDto | undefined) ?? null;
  }

  const fallback = await chrome.storage.session.get(LATEST_FALLBACK_KEY);
  return (fallback[LATEST_FALLBACK_KEY] as TokenEstimateDto | undefined) ?? null;
}
