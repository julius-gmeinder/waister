/**
 * ImpactFigures: energy, water and CO2 as three small icon + value pairs, each icon in its impact
 * accent. Used in History rows and the History summary line.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { Droplet, Factory, Zap, type LucideIcon } from 'lucide-react';
import type { EnvironmentalImpact } from '../../dto/token-estimate.dto';
import { formatCo2, formatEnergy, formatWater, type Quantity } from '../format.helpers';

interface ImpactFiguresProps {
  /** `undefined` while loading. */
  impact: EnvironmentalImpact | undefined;
}

interface FigureProps {
  tone: 'power' | 'water' | 'co2';
  label: string;
  quantity: Quantity;
  icon: LucideIcon;
}

function Figure({ tone, label, quantity, icon: Icon }: FigureProps) {
  return (
    <span className={`impact-figures-item impact-figures-item--${tone}`} title={label}>
      <Icon aria-hidden="true" />
      <span className="impact-figures-value">
        {quantity.value} {quantity.unit}
      </span>
    </span>
  );
}

export function ImpactFigures({ impact }: ImpactFiguresProps) {
  return (
    <span className="impact-figures">
      <Figure tone="power" label="Energy" quantity={formatEnergy(impact?.energyWh)} icon={Zap} />
      <Figure tone="water" label="Water" quantity={formatWater(impact?.waterMl)} icon={Droplet} />
      <Figure tone="co2" label="CO2" quantity={formatCo2(impact?.co2Grams)} icon={Factory} />
    </span>
  );
}
