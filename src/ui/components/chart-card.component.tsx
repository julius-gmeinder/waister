/**
 * ChartCard: anti-bloat analytics card container with a title, subtle `ⓘ` methodology tooltip,
 * dynamic 1-line insight subtitle, and optional right-side header action (e.g. mode toggle).
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { ReactNode } from 'react';
import { InfoTooltip } from './info-tooltip.component';

interface ChartCardProps {
  title: string;
  subtitle: string;
  tooltip: string;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, tooltip, headerRight, children }: ChartCardProps) {
  return (
    <article className="chart-card">
      <header className="chart-card-header">
        <div className="chart-card-heading">
          <div className="chart-card-title-row">
            <h2 className="chart-card-title">{title}</h2>
            <InfoTooltip text={tooltip} label={`${title} methodology`} />
          </div>
          <p className="chart-card-subtitle">{subtitle}</p>
        </div>
        {headerRight && <div className="chart-card-actions">{headerRight}</div>}
      </header>
      <div className="chart-card-body">{children}</div>
    </article>
  );
}
