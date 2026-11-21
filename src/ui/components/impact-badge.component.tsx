/**
 * ImpactBadge: small solid pill (icon + serif label) naming one impact category: energy, water
 * or CO2. Sits in the top left of the dashboard cards and the FactCards.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { Droplet, Factory, Zap, type LucideIcon } from 'lucide-react';

/** Same keys as the impact accents in base.css (`--power`, `--water`, `--co2`). */
export type ImpactKind = 'power' | 'water' | 'co2';

const BADGES: Record<ImpactKind, { label: string; icon: LucideIcon }> = {
  power: { label: 'Energy', icon: Zap },
  water: { label: 'Water', icon: Droplet },
  co2: { label: 'CO₂', icon: Factory },
};

interface ImpactBadgeProps {
  kind: ImpactKind;
}

export function ImpactBadge({ kind }: ImpactBadgeProps) {
  const { label, icon: Icon } = BADGES[kind];
  return (
    <span className={`impact-badge impact-badge--${kind}`}>
      <Icon aria-hidden="true" />
      {label}
    </span>
  );
}
