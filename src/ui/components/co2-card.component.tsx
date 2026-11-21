/**
 * Co2Card: CO2 emitted in the selected timeframe. A small factory puffs smoke clouds that rise,
 * swell and fade, and every puff sends a toxic haze off the number. The puff rate comes in as
 * props, the motion itself is CSS (`--puff`).
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { CSSProperties } from 'react';
import { formatCo2 } from '../format.helpers';
import { ImpactBadge } from './impact-badge.component';

interface Co2CardProps {
  /** `undefined` while loading. */
  co2Grams: number | undefined;
  /** Time between two clouds. `null` = no usage, no smoke. */
  puffMs: number | null;
  /** Clouds in the loop. Each one restarts after `cloudCount × puffMs`, which keeps the stream even. */
  cloudCount: number;
}

// Scene geometry in viewBox units (240 × 170), ground at the same height as the other cards.
const GROUND_Y = 160;
const ROOF_Y = 130;

/** Sawtooth hall on the left, flat annex with the chimneys on the right. */
const HALL_PATH = `M64 ${GROUND_Y} V118 L86 ${ROOF_Y} V118 L108 ${ROOF_Y} V118 L130 ${ROOF_Y} H176 V${GROUND_Y} Z`;
const WINDOWS = [74, 92, 110];

/**
 * Each chimney is drawn from its top down into the roof. `rise` / `drift` = where a cloud ends,
 * relative to the chimney top: just below the number, pushed a bit to the right by the wind.
 */
const TALL_CHIMNEY = { x: 140, width: 12, top: 80, rise: -66, drift: 8 };
const SHORT_CHIMNEY = { x: 160, width: 10, top: 100, rise: -84, drift: 14 };
const CHIMNEYS = [TALL_CHIMNEY, SHORT_CHIMNEY];

/** Puffy cloud of three bumps around 0,0, flat bottom. */
const CLOUD_PATH = 'M-7 6 A5 5 0 0 1 -7 -4 A7 7 0 0 1 7 -3.9 A5 5 0 0 1 8 6 Z';

export function Co2Card({ co2Grams, puffMs, cloudCount }: Co2CardProps) {
  const { value, unit } = formatCo2(co2Grams);
  const idle = puffMs === null;
  const style = idle
    ? undefined
    : ({ '--puff': `${puffMs}ms`, '--cloud-count': cloudCount } as CSSProperties);
  const clouds = idle ? [] : Array.from({ length: cloudCount }, (_, index) => index);

  return (
    <article className={idle ? 'co2-card co2-card--idle' : 'co2-card'} style={style}>
      <h2 className="co2-card-label">
        <ImpactBadge kind="co2" />
      </h2>
      <p className="co2-card-value">
        {value}
        <span className="co2-card-unit">{unit}</span>
      </p>
      <svg className="co2-card-scene" viewBox="0 0 240 170" aria-hidden="true">
        {/* Clouds first: they start inside the chimney and come out of its top. */}
        {clouds.map((index) => {
          // The chimneys take turns, so a fast stream comes out of both.
          const chimney = index % 2 === 0 ? TALL_CHIMNEY : SHORT_CHIMNEY;
          return (
            <g
              key={index}
              transform={`translate(${chimney.x + chimney.width / 2} ${chimney.top - 2})`}
            >
              <path
                className="co2-cloud"
                d={CLOUD_PATH}
                style={
                  {
                    '--cloud-index': index,
                    '--cloud-rise': `${chimney.rise}px`,
                    '--cloud-drift': `${chimney.drift}px`,
                  } as CSSProperties
                }
              />
            </g>
          );
        })}
        {CHIMNEYS.map(({ x, width, top }) => (
          <g key={x}>
            <rect className="co2-factory" x={x} y={top} width={width} height={ROOF_Y - top} />
            <rect className="co2-factory" x={x - 2} y={top} width={width + 4} height={5} />
          </g>
        ))}
        <path className="co2-factory" d={HALL_PATH} />
        {WINDOWS.map((x) => (
          <rect key={x} className="co2-window" x={x} y={139} width={10} height={9} />
        ))}
        <path className="co2-factory" d={`M148 ${GROUND_Y} V143 H162 V${GROUND_Y}`} />
        <path className="co2-ground" d={`M30 ${GROUND_Y} H210`} />
      </svg>
    </article>
  );
}
