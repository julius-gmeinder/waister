/**
 * PopupApp: root component of the popup. Fetches the last 24h of token usage from the database
 * and renders it.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import { useEffect, useState } from 'react';
import { ui } from '../../config/config.json';
import type { UsageSummaryDto } from '../../dto/usage-summary.dto';
import type { GetUsageSummaryMessage, UsageSummaryResponse } from '../../messages/runtime-messages';
import { Breakdown } from '../components/breakdown.component';
import { Header } from '../components/header.component';
import { TabBar } from '../components/tab-bar.component';
import { Total } from '../components/total.component';

const USAGE_WINDOW_MS = ui.usageWindowHours * 60 * 60 * 1000;
const USAGE_WINDOW_LABEL = `last ${ui.usageWindowHours}h`;

/** `undefined` while loading, `null` if the background had no answer. */
type SummaryState = UsageSummaryDto | null | undefined;

async function fetchUsageSummary(): Promise<UsageSummaryDto | null> {
  const message: GetUsageSummaryMessage = {
    type: 'GET_USAGE_SUMMARY',
    payload: { sinceMs: Date.now() - USAGE_WINDOW_MS },
  };

  try {
    const response = (await chrome.runtime.sendMessage(message)) as
      UsageSummaryResponse | { error: string };
    return 'error' in response ? null : response;
  } catch {
    return null;
  }
}

function describePromptCount(summary: SummaryState): string {
  if (summary === undefined) return '–';
  if (summary === null) return 'No data';
  const count = summary.promptCount;
  return `${count.toLocaleString()} ${count === 1 ? 'prompt' : 'prompts'}`;
}

export function PopupApp() {
  const [summary, setSummary] = useState<SummaryState>(undefined);

  useEffect(() => {
    void fetchUsageSummary().then(setSummary);
  }, []);

  return (
    <main className="popup">
      <Header />
      <Total totalTokens={summary?.totalTokens} />
      <p className="period">
        {describePromptCount(summary)} · {USAGE_WINDOW_LABEL}
      </p>
      <Breakdown breakdown={summary?.breakdown} />
      <TabBar />
    </main>
  );
}
