/**
 * PopupApp: root component of the popup. Fetches the last 24h of token usage from the database
 * and renders it.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import { useState } from 'react';
import { ui } from '../../config/config.json';
import { Breakdown } from '../components/breakdown.component';
import { Header } from '../components/header.component';
import { TabBar } from '../components/tab-bar.component';
import { ImpactTachos } from '../components/tacho.component';
import { Total } from '../components/total.component';
import { formatCount } from '../format.helpers';
import { useUsageSummary, type SummaryState } from '../usage-api';

const USAGE_WINDOW_MS = ui.usageWindowHours * 60 * 60 * 1000;
const USAGE_WINDOW_LABEL = `last ${ui.usageWindowHours}h`;

function describePromptCount(summary: SummaryState): string {
  if (summary === undefined) return '–';
  if (summary === null) return 'No data';
  const count = summary.promptCount;
  return `${formatCount(count)} ${count === 1 ? 'prompt' : 'prompts'}`;
}

export function PopupApp() {
  // Fixed when the popup opens: it only lives while it is open.
  const [sinceMs] = useState(() => Date.now() - USAGE_WINDOW_MS);
  const summary = useUsageSummary(sinceMs);

  return (
    <main className="popup">
      <Header />
      <Total totalTokens={summary?.totalTokens} />
      <p className="popup-period">
        {describePromptCount(summary)} · {USAGE_WINDOW_LABEL}
      </p>
      <Breakdown breakdown={summary?.breakdown} />
      <ImpactTachos impact={summary?.impact} />
      <TabBar />
    </main>
  );
}
