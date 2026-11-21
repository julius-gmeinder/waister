/**
 * UsageHandler: answers the popup's and the app page's usage and history queries from the
 * database (read-only).
 *
 * Context: background
 * Docs: docs/modules.md#handlers
 */

import type { PromptHistoryDto, PromptHistoryQuery } from '../dto/prompt-history.dto';
import type { UsageSummaryDto } from '../dto/usage-summary.dto';
import { getPromptHistory, getUsageSummary } from '../services/prompt-store/prompt-store.service';

export async function handleGetUsageSummary(sinceMs: number): Promise<UsageSummaryDto> {
  return getUsageSummary(sinceMs);
}

export async function handleGetPromptHistory(query: PromptHistoryQuery): Promise<PromptHistoryDto> {
  return getPromptHistory(query);
}
