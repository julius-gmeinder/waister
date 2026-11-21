/**
 * DashboardPage: tokens (TokenTotalCard), energy, water and CO2 of the selected timeframe, each
 * impact card with a fun fact. The App root owns the timeframe and the fetched summary, this page
 * only renders them. The facts are drawn fresh every time the page opens.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { useMemo, useState } from 'react';
import { Co2Card } from '../../components/co2-card.component';
import { PageTitle } from '../../components/page-title.component';
import { PowerCard } from '../../components/power-card.component';
import { TimeframePicker } from '../../components/timeframe-picker.component';
import { TokenTotalCard } from '../../components/token-total-card.component';
import { WaterCard } from '../../components/water-card.component';
import { formatCount } from '../../format.helpers';
import type { TimeframeId } from '../../timeframe.helpers';
import type { SummaryState } from '../../usage-api';
import { dashboardAnimation, dashboardFacts } from './dashboard.helpers';
import { seededRandom } from './facts.helpers';

interface DashboardPageProps {
  timeframe: TimeframeId;
  onTimeframeChange: (id: TimeframeId) => void;
  summary: SummaryState;
}

function describeUsage(summary: SummaryState): string {
  if (summary === undefined) return 'Loading…';
  if (summary === null || summary.promptCount === 0) return 'No prompts yet';
  const prompts = summary.promptCount;
  const avg = Math.round(summary.totalTokens / prompts);
  return `${formatCount(prompts)} ${prompts === 1 ? 'prompt' : 'prompts'} · avg ${formatCount(avg)} per prompt`;
}

export function DashboardPage({ timeframe, onTimeframeChange, summary }: DashboardPageProps) {
  const animation = useMemo(() => dashboardAnimation(summary), [summary]);
  // New seed per visit, so every opening shows other facts. Seeded instead of Math.random, so a
  // summary refresh while the page is open keeps the same picks for the same numbers.
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 32));
  const facts = useMemo(
    () => dashboardFacts(summary, timeframe, seededRandom(seed)),
    [summary, timeframe, seed],
  );

  return (
    <section className="dashboard">
      <PageTitle>Dashboard</PageTitle>
      <TimeframePicker value={timeframe} onChange={onTimeframeChange} />
      <TokenTotalCard
        tokens={summary === null ? 0 : summary?.totalTokens}
        label="Total tokens"
        detail={describeUsage(summary)}
        coins
      />
      <div className="dashboard-cards">
        <PowerCard
          energyWh={summary?.impact.energyWh}
          pulseMs={animation.pulseMs}
          fact={facts?.power ?? null}
        />
        <WaterCard
          waterMl={summary?.impact.waterMl}
          dripMs={animation.dripMs}
          pondFill={animation.pondFill}
          fact={facts?.water ?? null}
        />
        <Co2Card
          co2Grams={summary?.impact.co2Grams}
          puffMs={animation.puffMs}
          cloudCount={animation.cloudCount}
          fact={facts?.co2 ?? null}
        />
      </div>
    </section>
  );
}
