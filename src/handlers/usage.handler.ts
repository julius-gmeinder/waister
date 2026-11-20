/**
 * UsageHandler: answers the popup's usage queries straight from the database.
 * Has no link to the estimation pipeline: estimation writes prompts, this only reads them.
 *
 * Context: background
 * Docs: docs/modules.md#handlers
 */

import type { UsageSummaryDto } from '../dto/usage-summary.dto';
import { getUsageSummary } from '../services/prompt-store/prompt-store.service';

/** Summed token usage of all saved prompts captured since `sinceMs` (epoch ms). */
export async function handleGetUsageSummary(sinceMs: number): Promise<UsageSummaryDto> {
  return getUsageSummary(sinceMs);
}
