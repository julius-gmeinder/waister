/**
 * Sidebar: logo plus one link per app page. Links only change the hash, so switching
 * pages doesn't reload.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { APP_ROUTES, routeHash, type AppRouteId } from '../app-routes';
import { Header } from './header.component';

interface SidebarProps {
  activeRoute: AppRouteId;
}

export function Sidebar({ activeRoute }: SidebarProps) {
  return (
    <aside className="sidebar">
      <Header />
      <nav aria-label="Pages">
        <ul className="sidebar-nav">
          {APP_ROUTES.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <a
                className="sidebar-link"
                href={routeHash(id)}
                aria-current={id === activeRoute ? 'page' : undefined}
              >
                <Icon />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
