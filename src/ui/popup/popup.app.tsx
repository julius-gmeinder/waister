/**
 * PopupApp: root component of the popup. Fetches usage for the chosen Dashboard timeframe and
 * leads with energy, water and CO2 in compact animated tiles, with tokens as a quiet summary.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import { Coins } from 'lucide-react';
import { useMemo, useState } from 'react';
import { dashboardAnimation } from '../app/pages/dashboard.helpers';
import { Co2Card } from '../components/co2-card.component';
import { PowerCard } from '../components/power-card.component';
import { TabBar } from '../components/tab-bar.component';
import { TimeframeSelect } from '../components/timeframe-select.component';
import { TokenCount } from '../components/token-count.component';
import { WaterCard } from '../components/water-card.component';
import { formatCount } from '../format.helpers';
import { DEFAULT_TIMEFRAME, timeframeSinceMs, type TimeframeId } from '../timeframe.helpers';
import { useUsageSummary, type SummaryState } from '../usage-api';

const LOGO_SRC = '/logo/waister-full.svg';

function describePromptCount(summary: SummaryState): string {
  if (summary === undefined) return '–';
  if (summary === null) return 'No data';
  const count = summary.promptCount;
  return `${formatCount(count)} ${count === 1 ? 'prompt' : 'prompts'}`;
}

export function PopupApp() {
  const [timeframe, setTimeframe] = useState<TimeframeId>(DEFAULT_TIMEFRAME);
  // Fixed per selection, so the rolling windows don't refetch on every render.
  const sinceMs = useMemo(() => timeframeSinceMs(timeframe, Date.now()), [timeframe]);
  const summary = useUsageSummary(sinceMs);
  const animation = useMemo(() => dashboardAnimation(summary), [summary]);
  const avgTokens =
    summary && summary.promptCount > 0
      ? Math.round(summary.totalTokens / summary.promptCount)
      : null;

  return (
    <main className="popup">
      <header className="popup-header">
        <img className="popup-logo" src={LOGO_SRC} alt="Waister" />
        <div className="popup-header-controls">
          <span className="popup-period">{describePromptCount(summary)}</span>
          <TimeframeSelect value={timeframe} onChange={setTimeframe} />
        </div>
      </header>
      <section className="popup-impacts" aria-label="Environmental impact">
        <PowerCard
          variant="compact"
          energyWh={summary?.impact.energyWh}
          pulseMs={animation.pulseMs}
        />
        <WaterCard
          variant="compact"
          waterMl={summary?.impact.waterMl}
          dripMs={animation.dripMs}
          poolFill={animation.poolFill}
        />
        <Co2Card
          variant="compact"
          co2Grams={summary?.impact.co2Grams}
          puffMs={animation.puffMs}
          cloudCount={animation.cloudCount}
        />
      </section>
      <div className="popup-tokens">
        <span className="popup-tokens-total">
          <Coins aria-hidden="true" />
          <TokenCount value={summary === null ? 0 : summary?.totalTokens} />
        </span>
        {avgTokens !== null && (
          <span className="popup-tokens-avg">avg {formatCount(avgTokens)} / prompt</span>
        )}
      </div>
      <TabBar />
    </main>
  );
}
