/**
 * WaterCard: water used in the selected timeframe. Drops fall from the number into a swaying
 * pool, and the number wobbles like liquid as each drop tears off. Drip rate and pool level come in as props, the motion itself is CSS (`--drip`).
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { CSSProperties } from 'react';
import { formatWater } from '../format.helpers';
import { ImpactBadge } from './impact-badge.component';

interface WaterCardProps {
  /** `undefined` while loading. */
  waterMl: number | undefined;
  /** Time between two drops. `null` = no usage, no drops. */
  dripMs: number | null;
  /** Pool fill level, 0..1 of the basin height. */
  poolFill: number;
}

// Scene geometry in viewBox units (240 × 170).
const DROP_TOP = 2;
const DROP_HEIGHT = 17;
/** Vertical stretch of the drop just before it hits the water (keyframe `water-drop`). */
const DROP_STRETCH = 1.2;
const BASIN_TOP = 96;
const BASIN_BOTTOM = 160;

const BASIN_INTERIOR = `M40 ${BASIN_TOP} V132 A28 28 0 0 0 68 ${BASIN_BOTTOM} H172 A28 28 0 0 0 200 132 V${BASIN_TOP} Z`;
const BASIN_OUTLINE = `M30 ${BASIN_TOP} H40 V132 A28 28 0 0 0 68 ${BASIN_BOTTOM} H172 A28 28 0 0 0 200 132 V${BASIN_TOP} H210`;

/** Teardrop hanging from its tip at 0,0. */
const DROP_PATH = 'M0 0 C2 4 6 7.5 6 11 A6 6 0 0 1 -6 11 C-6 7.5 -2 4 0 0 Z';

/**
 * Water body whose top edge is a wave around y = 0. Wider than the basin (40..200) so the ±10
 * sway never shows an edge.
 */
function wavePath(amplitude: number, halfWave: number): string {
  let d = `M0 0 Q${halfWave / 2} ${-amplitude} ${halfWave} 0`;
  for (let x = 2 * halfWave; x <= 240; x += halfWave) d += ` T${x} 0`;
  return `${d} V${BASIN_BOTTOM - BASIN_TOP} H0 Z`;
}

const BACK_WAVE = wavePath(3, 24);
const FRONT_WAVE = wavePath(2.5, 18);

/** Only one WaterCard is ever on a page, so a fixed id is unique. */
const CLIP_ID = 'water-card-pool';

export function WaterCard({ waterMl, dripMs, poolFill }: WaterCardProps) {
  const { value, unit } = formatWater(waterMl);
  const idle = dripMs === null;
  const surfaceY = BASIN_BOTTOM - poolFill * (BASIN_BOTTOM - BASIN_TOP);
  const dropFall = surfaceY - DROP_TOP - DROP_HEIGHT * DROP_STRETCH;
  const style = {
    '--drop-fall': `${dropFall}px`,
    ...(idle ? {} : { '--drip': `${dripMs}ms` }),
  } as CSSProperties;

  return (
    <article className={idle ? 'water-card water-card--idle' : 'water-card'} style={style}>
      <h2 className="water-card-label">
        <ImpactBadge kind="water" />
      </h2>
      <p className="water-card-value">
        {value}
        <span className="water-card-unit">{unit}</span>
      </p>
      <svg className="water-card-scene" viewBox="0 0 240 170" aria-hidden="true">
        <defs>
          <clipPath id={CLIP_ID}>
            <path d={BASIN_INTERIOR} />
          </clipPath>
        </defs>
        <path className="water-basin-fill" d={BASIN_INTERIOR} />
        <g clipPath={`url(#${CLIP_ID})`}>
          <g className="water-level" style={{ transform: `translateY(${surfaceY}px)` }}>
            <path className="water-wave water-wave--back" d={BACK_WAVE} />
            <path className="water-wave water-wave--front" d={FRONT_WAVE} />
            <ellipse className="water-ripple" cx="120" cy="0" rx="22" ry="4" />
          </g>
        </g>
        <path className="water-basin" d={BASIN_OUTLINE} />
        <g transform={`translate(120 ${DROP_TOP})`}>
          <path className="water-drop" d={DROP_PATH} />
        </g>
      </svg>
    </article>
  );
}
