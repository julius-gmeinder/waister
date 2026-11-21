/**
 * App: root component of the full-screen app page (app/index.html). Reads the route from the
 * URL hash, renders the Sidebar plus the matching page, fetches the dashboard's summary for the
 * selected timeframe and pages through the History's prompts for its filter.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import { parseRouteHash, type AppRouteId } from '../app-routes';
import { Sidebar } from '../components/sidebar.component';
import { DEFAULT_HISTORY_VIEW, type HistoryView } from '../history.helpers';
import { DEFAULT_TIMEFRAME, timeframeSinceMs, type TimeframeId } from '../timeframe.helpers';
import {
  useFactsSummaries,
  usePromptHistory,
  usePromptRecords,
  useUsageSummary,
  type HistoryFilter,
} from '../usage-api';
import { AnalyticsPage } from './pages/analytics.page';
import { DashboardPage } from './pages/dashboard.page';
import { FactsPage } from './pages/facts.page';
import { HistoryPage } from './pages/history.page';
import { TipsPage } from './pages/tips.page';

/** Pages without props. Dashboard, Analytics, History and Facts receive fetched data from here. */
const PAGES: Record<
  Exclude<AppRouteId, 'dashboard' | 'analytics' | 'history' | 'facts'>,
  ComponentType
> = {
  tips: TipsPage,
};

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function readHash(): string {
  return window.location.hash;
}

export function App() {
  const route = parseRouteHash(useSyncExternalStore(subscribeToHash, readHash));
  const [timeframe, setTimeframe] = useState<TimeframeId>(DEFAULT_TIMEFRAME);
  const [dataRevision, setDataRevision] = useState(0);
  const handleHistoryCleared = useCallback(() => {
    setDataRevision((rev) => rev + 1);
  }, []);

  // Fixed per selection, so the rolling windows don't refetch on every render.
  const sinceMs = useMemo(() => timeframeSinceMs(timeframe, Date.now()), [timeframe]);
  const summary = useUsageSummary(sinceMs, dataRevision);
  const factsSummaries = useFactsSummaries(dataRevision);
  const { records, resetHistory, clearLegacyHistory } = usePromptRecords(handleHistoryCleared);

  const [historyView, setHistoryView] = useState<HistoryView>(DEFAULT_HISTORY_VIEW);
  // Memoized like `sinceMs`: a new filter object restarts the paging.
  const historyFilter = useMemo<HistoryFilter>(
    () => ({
      sinceMs: timeframeSinceMs(historyView.timeframe, Date.now()),
      providers: historyView.providers,
      sort: historyView.sort,
    }),
    [historyView],
  );
  // Only while the page is open, and anew on every visit, so it shows prompts saved meanwhile.
  const history = usePromptHistory(historyFilter, route.id === 'history');

  useEffect(() => {
    document.title = `${route.label} · Waister`;
  }, [route]);

  let page;
  if (route.id === 'dashboard') {
    page = (
      <DashboardPage timeframe={timeframe} onTimeframeChange={setTimeframe} summary={summary} />
    );
  } else if (route.id === 'analytics') {
    page = (
      <AnalyticsPage
        records={records}
        onResetHistory={resetHistory}
        onClearLegacyHistory={clearLegacyHistory}
      />
    );
  } else if (route.id === 'history') {
    page = <HistoryPage view={historyView} onViewChange={setHistoryView} history={history} />;
  } else if (route.id === 'facts') {
    page = <FactsPage summaries={factsSummaries} />;
  } else {
    const Page = PAGES[route.id];
    page = <Page />;
  }

  return (
    <div className="app">
      <Sidebar activeRoute={route.id} />
      <main className="app-content">{page}</main>
    </div>
  );
}
