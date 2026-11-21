/**
 * Answers the popup's usage queries from the database (read-only).
 *
 * Context: background
 * Docs: docs/modules.md#handlers
 */

import type { UsageSummaryDto } from '../dto/usage-summary.dto';
import { getUsageSummary } from '../services/prompt-store/prompt-store.service';

export async function handleGetUsageSummary(sinceMs: number): Promise<UsageSummaryDto> {
  return getUsageSummary(sinceMs);
}
