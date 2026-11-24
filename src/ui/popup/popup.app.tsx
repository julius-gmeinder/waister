/**
 * PopupApp: root component of the popup. Fetches usage for the chosen Dashboard timeframe and
 * renders tokens, energy, water and CO2 as four stacked horizontal tiles with full-height left
 * badge strips. Until the privacy notice is answered (or while it is reopened from the header's
 * shield button) the notice replaces the tiles.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import { ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { dashboardAnimation } from '../app/pages/dashboard.helpers';
import { Co2Card } from '../components/co2-card.component';
import { PowerCard } from '../components/power-card.component';
import { PrivacyNotice } from '../components/privacy-notice.component';
import { TabBar } from '../components/tab-bar.component';
import { TimeframeSelect } from '../components/timeframe-select.component';
import { TokenTotalCard } from '../components/token-total-card.component';
import { WaterCard } from '../components/water-card.component';
import { formatCount } from '../format.helpers';
import { DEFAULT_TIMEFRAME, timeframeSinceMs, type TimeframeId } from '../timeframe.helpers';
import {
  clearPromptHistory,
  usePrivacyConsent,
  useUsageSummary,
  type SummaryState,
} from '../usage-api';

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
  const [dataRevision, setDataRevision] = useState(0);
  const summary = useUsageSummary(sinceMs, dataRevision);
  const { consent, decide } = usePrivacyConsent();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const showPrivacy = consent != null && (consent.status === 'unset' || privacyOpen);

  const deleteData = async (): Promise<boolean> => {
    const ok = await clearPromptHistory(false);
    if (ok) setDataRevision((rev) => rev + 1);
    return ok;
  };
  const animation = useMemo(() => dashboardAnimation(summary), [summary]);

  return (
    <main className="popup">
      <header className="popup-header">
        <img className="popup-logo" src={LOGO_SRC} alt="Waister" />
        <div className="popup-header-controls">
          <span className="popup-period">{describePromptCount(summary)}</span>
          <TimeframeSelect value={timeframe} onChange={setTimeframe} />
          <button
            type="button"
            className="popup-privacy"
            onClick={() => setPrivacyOpen(true)}
            aria-label="Privacy"
            title="Privacy"
          >
            <ShieldCheck />
          </button>
        </div>
      </header>
      {showPrivacy ? (
        <PrivacyNotice
          variant="inline"
          consent={consent}
          onDecide={decide}
          onClose={() => setPrivacyOpen(false)}
          onDeleteData={deleteData}
        />
      ) : (
        <>
          <section className="popup-impacts" aria-label="Usage and environmental impact">
            <TokenTotalCard
              variant="compact"
              tokens={summary === null ? 0 : summary?.totalTokens}
              label="Tokens"
              spitMs={animation.spitMs}
              coinCount={animation.coinCount}
              enterIndex={0}
            />
            <PowerCard
              variant="compact"
              energyWh={summary?.impact.energyWh}
              pulseMs={animation.pulseMs}
            />
            <WaterCard
              variant="compact"
              waterMl={summary?.impact.waterMl}
              dripMs={animation.dripMs}
              pondFill={animation.pondFill}
            />
            <Co2Card
              variant="compact"
              co2Grams={summary?.impact.co2Grams}
              puffMs={animation.puffMs}
              cloudCount={animation.cloudCount}
            />
          </section>
          {consent?.status === 'declined' && (
            <p className="popup-privacy-off">
              Recording is off.{' '}
              <button type="button" onClick={() => setPrivacyOpen(true)}>
                Privacy settings
              </button>
            </p>
          )}
        </>
      )}
      <TabBar />
    </main>
  );
}
