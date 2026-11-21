/**
 * ChartCard: analytics tile with a serif title, a subtle `ⓘ` methodology tooltip, a dynamic
 * one-line insight subtitle and an optional header action on the right (chips, legend).
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { CSSProperties, ReactNode } from 'react';
import { InfoTooltip } from './info-tooltip.component';

interface ChartCardProps {
  title: string;
  subtitle: string;
  tooltip: string;
  headerRight?: ReactNode;
  /** Position in the page-open stagger (`tile-enter`). */
  enterIndex?: number;
  children: ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  tooltip,
  headerRight,
  enterIndex = 0,
  children,
}: ChartCardProps) {
  return (
    <article className="chart-card" style={{ '--enter-index': enterIndex } as CSSProperties}>
      <header className="chart-card-header">
        <div className="chart-card-heading">
          <div className="chart-card-title-row">
            <h2 className="chart-card-title">{title}</h2>
            <InfoTooltip text={tooltip} label={`${title}: methodology`} />
          </div>
          <p className="chart-card-subtitle">{subtitle}</p>
        </div>
        {headerRight && <div className="chart-card-actions">{headerRight}</div>}
      </header>
      <div className="chart-card-body">{children}</div>
    </article>
  );
}
