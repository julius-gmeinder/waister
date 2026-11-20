/**
 * Routes runtime messages (messages/runtime-messages) to the right handler.
 * ESTIMATE_PROMPT -> estimation.handler (`handleEstimation`),
 * GET_USAGE_SUMMARY -> usage.handler (`handleGetUsageSummary`).
 *
 * Context: background
 * Docs: docs/modules.md#handlers
 */

import type { RuntimeMessage } from '../messages/runtime-messages';
import { handleEstimation } from './estimation.handler';
import { handleGetUsageSummary } from './usage.handler';

/**
 * Dispatches an incoming `chrome.runtime` message by its `type` discriminator.
 */
export async function handleRuntimeMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case 'ESTIMATE_PROMPT':
      return handleEstimation(message.payload);
    case 'GET_USAGE_SUMMARY':
      return handleGetUsageSummary(message.payload.sinceMs);
    default:
      return undefined;
  }
}
