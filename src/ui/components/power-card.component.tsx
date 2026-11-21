/**
 * PowerCard: energy used in the selected timeframe. The number pulses, and every pulse strikes a
 * lightning bolt into a set of gears that turn one tooth further. The whole timing is CSS
 * (`--pulse`), so bolts, glow and gears stay in sync when the period changes.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { Zap } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatEnergy } from '../format.helpers';

interface PowerCardProps {
  /** `undefined` while loading. */
  energyWh: number | undefined;
  /** Time between two pulses. `null` = no usage, nothing moves. */
  pulseMs: number | null;
}

/** Gear outline centered on 0,0 (one tooth along +x) with the axle hole cut out (evenodd). */
function gearPath(teeth: number, outerR: number, rootR: number, holeR: number): string {
  const step = (2 * Math.PI) / teeth;
  const at = (r: number, angle: number) =>
    `${(r * Math.cos(angle)).toFixed(2)} ${(r * Math.sin(angle)).toFixed(2)}`;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    // Flanks taper from 54% of a step at the root to 34% at the tip: chunky, but still thinner
    // than the other gear's gap at the pitch circle.
    d += `${i === 0 ? 'M' : 'L'}${at(rootR, a - step * 0.27)} `;
    d += `L${at(outerR, a - step * 0.17)} L${at(outerR, a + step * 0.17)} `;
    d += `L${at(rootR, a + step * 0.27)} A${rootR} ${rootR} 0 0 1 ${at(rootR, a + step * 0.73)} `;
  }
  return `${d}Z M${holeR} 0 A${holeR} ${holeR} 0 1 0 ${-holeR} 0 A${holeR} ${holeR} 0 1 0 ${holeR} 0 Z`;
}

// Same tooth size for both gears (pitch radius ∝ teeth), so they mesh: 8 teeth = 22, 6 = 16.5.
const GEAR_8 = gearPath(8, 26.5, 18.5, 6);
const GEAR_6 = gearPath(6, 21, 13, 4.5);

/**
 * The big gears rest on the shared ground line (y ≈ 160 of the 240 × 170 scene, like the basin
 * and the factory), so the three dashboard scenes line up. Centers are one pitch-radius sum apart.
 * `base` turns each gear so a tooth faces the other gear's gap. `step` is one tooth per pulse
 * (45° = 360/8), which keeps the loop seamless. Meshed gears turn the other way, the 6-tooth one
 * by 45 × 8/6 = 60°.
 */
const GEARS = [
  { x: 108, y: 133.5, d: GEAR_8, base: 0, step: 45 },
  { x: 152, y: 133.5, d: GEAR_8, base: 22.5, step: -45 },
  { x: 83.25, y: 104.01, d: GEAR_6, base: 26.67, step: -60 },
];

/**
 * Bolts from the top of the scene onto the rim of each gear (`tip` = last point, where the spark
 * flashes). They take turns, one per pulse.
 */
const BOLTS = [
  { points: '92,0 82,22 91,31 80,53 86,63 83,81.5', tip: { x: 83, y: 81.5 } },
  { points: '134,0 124,30 136,41 122,70 130,81 126,113.5', tip: { x: 126, y: 113.5 } },
  { points: '176,0 166,25 178,36 164,66 172,77 162,109.5', tip: { x: 162, y: 109.5 } },
];

export function PowerCard({ energyWh, pulseMs }: PowerCardProps) {
  const { value, unit } = formatEnergy(energyWh);
  const idle = pulseMs === null;
  const style = idle ? undefined : ({ '--pulse': `${pulseMs}ms` } as CSSProperties);

  return (
    <article className={idle ? 'power-card power-card--idle' : 'power-card'} style={style}>
      <h2 className="power-card-label">
        <Zap />
        Energy
      </h2>
      <p className="power-card-value">
        {value}
        <span className="power-card-unit">{unit}</span>
      </p>
      <svg className="power-card-scene" viewBox="0 0 240 170" aria-hidden="true">
        {GEARS.map(({ x, y, d, base, step }) => (
          <g key={`${x},${y}`} transform={`translate(${x} ${y}) rotate(${base})`}>
            <g className="power-gear" style={{ '--gear-step': `${step}deg` } as CSSProperties}>
              <path className="power-gear-body" d={d} />
            </g>
            <circle className="power-gear-axle" r="2.5" />
          </g>
        ))}
        {BOLTS.map(({ points, tip }, index) => (
          <g
            key={points}
            className="power-strike"
            style={{ '--strike-index': index } as CSSProperties}
          >
            <polyline className="power-bolt" points={points} pathLength={1} />
            <circle className="power-spark" cx={tip.x} cy={tip.y} r="3.5" />
          </g>
        ))}
      </svg>
    </article>
  );
}
