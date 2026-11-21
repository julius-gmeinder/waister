/**
 * DashboardPage: tokens, energy, water and CO2 of the selected timeframe. The App root owns the
 * timeframe and the fetched summary, this page only renders them.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { useMemo } from 'react';
import { Co2Card } from '../../components/co2-card.component';
import { PageTitle } from '../../components/page-title.component';
import { PowerCard } from '../../components/power-card.component';
import { TimeframePicker } from '../../components/timeframe-picker.component';
import { WaterCard } from '../../components/water-card.component';
import { TokenCount } from '../../components/token-count.component';
import { formatCount } from '../../format.helpers';
import type { TimeframeId } from '../../timeframe.helpers';
import type { SummaryState } from '../../usage-api';
import { dashboardAnimation } from './dashboard.helpers';

interface DashboardPageProps {
  timeframe: TimeframeId;
  onTimeframeChange: (id: TimeframeId) => void;
  summary: SummaryState;
}

function describeUsage(summary: SummaryState) {
  if (summary === null) return 'No data';
  const prompts = summary?.promptCount;
  return (
    <>
      <TokenCount value={summary?.totalTokens} size="large" />
      {prompts !== undefined &&
        ` across ${formatCount(prompts)} ${prompts === 1 ? 'prompt' : 'prompts'}`}
    </>
  );
}

export function DashboardPage({ timeframe, onTimeframeChange, summary }: DashboardPageProps) {
  const animation = useMemo(() => dashboardAnimation(summary), [summary]);

  return (
    <section className="dashboard">
      <PageTitle>Dashboard</PageTitle>
      <TimeframePicker value={timeframe} onChange={onTimeframeChange} />
      <p className="dashboard-subtitle">{describeUsage(summary)}</p>
      <div className="dashboard-cards">
        <PowerCard energyWh={summary?.impact.energyWh} pulseMs={animation.pulseMs} />
        <WaterCard
          waterMl={summary?.impact.waterMl}
          dripMs={animation.dripMs}
          poolFill={animation.poolFill}
        />
        <Co2Card
          co2Grams={summary?.impact.co2Grams}
          puffMs={animation.puffMs}
          cloudCount={animation.cloudCount}
        />
      </div>
    </section>
  );
}
