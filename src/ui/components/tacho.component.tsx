/**
 * ImpactTachos: two simple semi-circular tacho gauges for accumulated energy (Wh) and water (mL).
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

import { Droplet, Zap, type LucideIcon } from 'lucide-react';
import { ui } from '../../config/config.json';
import type { EnvironmentalImpact } from '../../dto/token-estimate.dto';
import { formatMetric } from '../format.helpers';

interface TachoProps {
  /** Accent color set (`--power*` / `--water*`) of the arc, track, icon and number. */
  tone: 'power' | 'water';
  icon: LucideIcon;
  label: string;
  unit: string;
  value: number | undefined;
  max: number;
}

function Tacho({ tone, icon: Icon, label, unit, value, max }: TachoProps) {
  const ratio = value && max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const dashOffset = 100 - ratio * 100;

  return (
    <div className={`tacho tacho--${tone}`}>
      <div className="tacho-gauge">
        <svg className="tacho-svg" viewBox="0 0 100 56" aria-hidden="true">
          <path className="tacho-track" d="M 10 50 A 40 40 0 0 1 90 50" pathLength={100} />
          <path
            className="tacho-fill"
            d="M 10 50 A 40 40 0 0 1 90 50"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="tacho-icon">
          <Icon />
        </div>
      </div>
      <div className="tacho-reading">
        <span className="tacho-value">{formatMetric(value)}</span>
        <span className="tacho-unit">{unit}</span>
      </div>
      <span className="tacho-label">{label}</span>
    </div>
  );
}

interface ImpactTachosProps {
  /** `undefined` while loading. */
  impact: EnvironmentalImpact | undefined;
}

export function ImpactTachos({ impact }: ImpactTachosProps) {
  return (
    <div className="tachos">
      <Tacho
        tone="power"
        icon={Zap}
        label="Energy"
        unit="Wh"
        value={impact?.energyWh}
        max={ui.tachoMax.energyWh}
      />
      <Tacho
        tone="water"
        icon={Droplet}
        label="Water"
        unit="mL"
        value={impact?.waterMl}
        max={ui.tachoMax.waterMl}
      />
    </div>
  );
}
