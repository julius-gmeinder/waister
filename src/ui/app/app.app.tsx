/**
 * App: root component of the full-screen app page (app/index.html). Reads the route from the
 * URL hash, renders the Sidebar plus the matching page, and fetches the dashboard's summary for
 * the selected timeframe.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from 'react';
import { parseRouteHash, type AppRouteId } from '../app-routes';
import { Sidebar } from '../components/sidebar.component';
import { DEFAULT_TIMEFRAME, timeframeSinceMs, type TimeframeId } from '../timeframe.helpers';
import { useUsageSummary } from '../usage-api';
import { AnalyticsPage } from './pages/analytics.page';
import { DashboardPage } from './pages/dashboard.page';
import { FactsPage } from './pages/facts.page';
import { HistoryPage } from './pages/history.page';
import { TipsPage } from './pages/tips.page';

/** Pages without props. The dashboard gets its data from here, see below. */
const PAGES: Record<Exclude<AppRouteId, 'dashboard'>, ComponentType> = {
  analytics: AnalyticsPage,
  facts: FactsPage,
  tips: TipsPage,
  history: HistoryPage,
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
  // Fixed per selection, so the rolling windows don't refetch on every render.
  const sinceMs = useMemo(() => timeframeSinceMs(timeframe, Date.now()), [timeframe]);
  const summary = useUsageSummary(sinceMs);

  useEffect(() => {
    document.title = `${route.label} · Waister`;
  }, [route]);

  let page;
  if (route.id === 'dashboard') {
    page = (
      <DashboardPage timeframe={timeframe} onTimeframeChange={setTimeframe} summary={summary} />
    );
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
