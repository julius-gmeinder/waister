/**
 * App: root component of the full-screen app page (app/index.html). Reads the route from the
 * URL hash and renders the Sidebar plus the matching page.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { useEffect, useSyncExternalStore, type ComponentType } from 'react';
import { parseRouteHash, type AppRouteId } from '../app-routes';
import { Sidebar } from '../components/sidebar.component';
import { AnalyticsPage } from './pages/analytics.page';
import { FactsPage } from './pages/facts.page';
import { HistoryPage } from './pages/history.page';
import { TipsPage } from './pages/tips.page';

const PAGES: Record<AppRouteId, ComponentType> = {
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
  const Page = PAGES[route.id];

  useEffect(() => {
    document.title = `${route.label} · Waister`;
  }, [route]);

  return (
    <div className="app">
      <Sidebar activeRoute={route.id} />
      <main className="app-content">
        <Page />
      </main>
    </div>
  );
}
