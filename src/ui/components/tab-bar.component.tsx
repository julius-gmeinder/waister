/**
 * TabBar: one tab per app page. A click opens that page in a new browser tab.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import type { MouseEvent } from 'react';
import { APP_ROUTES, appRouteUrl, type AppRouteId } from '../app-routes';

function openInNewTab(event: MouseEvent<HTMLAnchorElement>, id: AppRouteId): void {
  // chrome.tabs.create works the same in Chrome and Firefox popups and needs no permission.
  // The href stays for semantics and middle-click.
  event.preventDefault();
  void chrome.tabs.create({ url: appRouteUrl(id) });
}

export function TabBar() {
  return (
    <nav aria-label="Pages">
      <ul className="tab-bar">
        {APP_ROUTES.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <a
              className="tab-bar-link"
              href={appRouteUrl(id)}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => openInNewTab(event, id)}
            >
              <Icon />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
