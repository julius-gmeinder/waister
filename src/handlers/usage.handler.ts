/**
 * UsageHandler: answers the popup and app page's usage queries and history reset requests from the
 * database.
 *
 * Context: background
 * Docs: docs/modules.md#handlers
 */

import type { PromptRecordDto } from '../dto/prompt-record.dto';
import type { UsageSummaryDto } from '../dto/usage-summary.dto';
import type { ClearPromptRecordsResponse } from '../messages/runtime-messages';
import {
  clearLegacyPromptRecords,
  clearPromptRecords,
  getPromptRecords,
  getUsageSummary,
} from '../services/prompt-store/prompt-store.service';

export async function handleGetUsageSummary(sinceMs: number): Promise<UsageSummaryDto> {
  return getUsageSummary(sinceMs);
}

export async function handleGetPromptRecords(sinceMs: number): Promise<PromptRecordDto[]> {
  return getPromptRecords(sinceMs);
}

export async function handleClearPromptRecords(
  legacyOnly = false,
): Promise<ClearPromptRecordsResponse> {
  if (legacyOnly) {
    await clearLegacyPromptRecords();
  } else {
    await clearPromptRecords();
  }
  return { cleared: true };
}
