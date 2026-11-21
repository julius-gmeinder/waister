/**
 * PopupApp: root component of the popup. Fetches the last 24h of token usage from the database
 * and renders it.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import { useEffect, useState } from 'react';
import { estimation, ui } from '../../config/config.json';
import type { UsageSummaryDto } from '../../dto/usage-summary.dto';
import type { GetUsageSummaryMessage, UsageSummaryResponse } from '../../messages/runtime-messages';
import { Breakdown } from '../components/breakdown.component';
import { Header } from '../components/header.component';
import { TabBar } from '../components/tab-bar.component';
import { ImpactTachos } from '../components/tacho.component';
import { Total } from '../components/total.component';
import { formatCount } from '../format.helpers';

const USAGE_WINDOW_MS = ui.usageWindowHours * 60 * 60 * 1000;
const USAGE_WINDOW_LABEL = `last ${ui.usageWindowHours}h`;

/** `undefined` while loading, `null` if the background had no answer. */
type SummaryState = UsageSummaryDto | null | undefined;

/**
 * Ensures `impact` is populated even if the running background service worker hasn't been reloaded
 * yet and returned an older `UsageSummaryDto` payload without `impact`.
 */
function ensureImpact(summary: UsageSummaryResponse): UsageSummaryDto {
  if (
    summary.impact &&
    typeof summary.impact.energyWh === 'number' &&
    typeof summary.impact.waterMl === 'number'
  ) {
    return summary;
  }
  const { perTokensUnit, roundingDecimals } = estimation.impact;
  const rates = estimation.models.openai.default;
  const factor = 10 ** roundingDecimals;
  const scale = Math.max(0, summary.totalTokens) / perTokensUnit;
  const round = (value: number): number => Math.round(value * factor) / factor;

  return {
    ...summary,
    impact: {
      energyWh: round(scale * rates.energyWhPer1M),
      waterMl: round(scale * rates.waterMlPer1M),
      co2Grams: round(scale * rates.co2GramsPer1M),
    },
  };
}

async function fetchUsageSummary(): Promise<UsageSummaryDto | null> {
  const message: GetUsageSummaryMessage = {
    type: 'GET_USAGE_SUMMARY',
    payload: { sinceMs: Date.now() - USAGE_WINDOW_MS },
  };

  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    // The background answers `{ error }` on failure and nothing if no listener replied.
    if (!response || typeof response !== 'object' || 'error' in response) return null;
    return ensureImpact(response as UsageSummaryResponse);
  } catch {
    return null;
  }
}

function describePromptCount(summary: SummaryState): string {
  if (summary === undefined) return '–';
  if (summary === null) return 'No data';
  const count = summary.promptCount;
  return `${formatCount(count)} ${count === 1 ? 'prompt' : 'prompts'}`;
}

export function PopupApp() {
  const [summary, setSummary] = useState<SummaryState>(undefined);

  useEffect(() => {
    let ignore = false;
    void fetchUsageSummary().then((result) => {
      if (!ignore) setSummary(result);
    });
    return () => {
      ignore = true;
    };
  }, []);

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
