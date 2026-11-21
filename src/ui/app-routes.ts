/**
 * App routes: the pages of the full-screen app page (app/index.html), addressed by hash
 * (`#/dashboard`). Used by the app's Sidebar and by the popup's TabBar.
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

import {
  BookOpen,
  ChartColumn,
  Clock,
  LayoutDashboard,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';

export type AppRouteId = 'dashboard' | 'analytics' | 'facts' | 'tips' | 'history';

export interface AppRoute {
  id: AppRouteId;
  label: string;
  icon: LucideIcon;
}

const DASHBOARD: AppRoute = { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard };

/** Order of the tabs in the popup and of the links in the sidebar. */
export const APP_ROUTES: readonly AppRoute[] = [
  DASHBOARD,
  { id: 'analytics', label: 'Analytics', icon: ChartColumn },
  { id: 'facts', label: 'Facts', icon: BookOpen },
  { id: 'tips', label: 'Tips', icon: Lightbulb },
  { id: 'history', label: 'History', icon: Clock },
];

/** Shown when the hash is empty or unknown. */
export const DEFAULT_ROUTE: AppRoute = DASHBOARD;

/** Hash link inside the app page. */
export function routeHash(id: AppRouteId): string {
  return `#/${id}`;
}

/** Absolute extension URL, for opening a page from outside the app page (the popup). */
export function appRouteUrl(id: AppRouteId): string {
  return chrome.runtime.getURL(`app/index.html${routeHash(id)}`);
}

export function parseRouteHash(hash: string): AppRoute {
  const id = hash.replace(/^#\/?/, '');
  return APP_ROUTES.find((route) => route.id === id) ?? DEFAULT_ROUTE;
}
