/**
 * Keeps the latest TokenEstimateDto per tab in chrome.storage.session so the popup can read it
 * after the service worker has been stopped. No long-term persistence.
 *
 * Context: background
 * Docs: docs/modules.md#estimate-cache-service
 */
export {};
