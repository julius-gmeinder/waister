/**
 * PowerCard: energy used in the selected timeframe. The number pulses, and every pulse strikes a
 * lightning bolt from the number into a gear train that turns one tooth further. The whole timing
 * is CSS (`--pulse`), so bolts, glow and gears stay in sync when the period changes.
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

import { Zap } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { SelectedFactComparison } from '../app/pages/facts.helpers';
import { formatEnergy } from '../format.helpers';
import { ImpactBadge } from './impact-badge.component';
import { ImpactFact } from './impact-fact.component';

interface PowerCardProps {
  /** `undefined` while loading. */
  energyWh: number | undefined;
  /** Time between two pulses. `null` = no usage, nothing moves. */
  pulseMs: number | null;
  /** Fun fact under the scene (Dashboard). `null` while loading or omitted in compact mode. */
  fact?: SelectedFactComparison | null;
  /** `card` = Dashboard vertical tile with corner badge; `compact` = popup horizontal tile. */
  variant?: 'card' | 'compact';
}

interface Point {
  x: number;
  y: number;
}

/** Tooth size shared by every gear, so all of them mesh. Pitch radius = MODULE × teeth / 2. */
const MODULE = 2.9;

const at = (r: number, angle: number) =>
  `${(r * Math.cos(angle)).toFixed(2)} ${(r * Math.sin(angle)).toFixed(2)}`;

/**
 * Half tooth width (share of one tooth step) at a radius, from the root to the tip (offsets from
 * the pitch circle in modules). Tapers like an involute flank and stays thinner than the other
 * gear's gap at the pitch circle, so meshed teeth never touch.
 */
const TOOTH_PROFILE = [
  { r: -1.25, w: 0.29 },
  { r: 0, w: 0.235 },
  { r: 1, w: 0.15 },
];

/**
 * Gear outline centered on 0,0 (one tooth along +x), with the axle and, on big gears, four
 * chunky spoke windows cut out (evenodd).
 */
function gearPath(teeth: number, spokes: boolean): string {
  const pitch = (MODULE * teeth) / 2;
  const outer = pitch + MODULE;
  const root = pitch - 1.25 * MODULE;
  const step = (2 * Math.PI) / teeth;
  const flank = TOOTH_PROFILE.map(({ r, w }) => ({ r: pitch + r * MODULE, w: w * step }));
  const rootW = flank[0]!.w;
  const tipW = flank[flank.length - 1]!.w;

  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    flank.forEach(({ r, w }, j) => {
      d += `${i === 0 && j === 0 ? 'M' : 'L'}${at(r, a - w)} `;
    });
    d += `A${outer} ${outer} 0 0 1 ${at(outer, a + tipW)} `;
    for (let j = flank.length - 2; j >= 0; j--) d += `L${at(flank[j]!.r, a + flank[j]!.w)} `;
    d += `A${root} ${root} 0 0 1 ${at(root, a + step - rootW)} `;
  }
  d += 'Z ';

  const axle = axleRadius(pitch);
  d += `M${axle} 0 A${axle} ${axle} 0 1 0 ${-axle} 0 A${axle} ${axle} 0 1 0 ${axle} 0 Z `;

  if (spokes) {
    const rim = root - 1.4 * MODULE;
    const hub = Math.max(axle + 3, pitch * 0.32);
    const half = pitch * 0.13;
    const sector = Math.PI / 2;
    for (let k = 0; k < 4; k++) {
      // Spokes keep a constant width, so the window corners sit at a different angle per radius.
      const a0 = k * sector;
      const a1 = a0 + sector;
      const rimIn = Math.asin(half / rim);
      const hubIn = Math.asin(half / hub);
      d += `M${at(rim, a0 + rimIn)} A${rim} ${rim} 0 0 1 ${at(rim, a1 - rimIn)} `;
      d += `L${at(hub, a1 - hubIn)} A${hub} ${hub} 0 0 0 ${at(hub, a0 + hubIn)} Z `;
    }
  }

  return d;
}

function axleRadius(pitch: number): number {
  return Math.max(2.2, pitch * 0.12);
}

/**
 * The gear train: a big driver on the ground line (y ≈ 160 of the 240 × 170 scene, like the pond
 * and the factory), the rest hung off a parent at `angle` (degrees, from the parent's center), so
 * their centers always sit one pitch-radius sum apart. Sizes vary and the train climbs into the
 * top left, where the number leaves room. The top right stays free for the number and the bolts.
 */
const GEAR_SPECS: readonly { teeth: number; spokes: boolean; parent?: number; angle?: number }[] = [
  { teeth: 20, spokes: true },
  { teeth: 12, spokes: false, parent: 0, angle: -128 },
  { teeth: 18, spokes: true, parent: 1, angle: -122 },
  { teeth: 8, spokes: false, parent: 2, angle: 158 },
  { teeth: 14, spokes: true, parent: 0, angle: -18 },
  { teeth: 8, spokes: false, parent: 4, angle: 48 },
  { teeth: 10, spokes: false, parent: 0, angle: 170 },
];
const DRIVER_CENTER: Point = { x: 130, y: 126 };

interface Gear extends Point {
  d: string;
  teeth: number;
  outer: number;
  /** Start angle (deg) that puts a tooth into the parent's gap. */
  base: number;
  /** Turn direction: 1 = clockwise, -1 = counterclockwise (the other way than the parent). */
  turn: 1 | -1;
  /** Axle dot radius, just inside the axle hole. */
  axle: number;
  /** Plain gears get a ring around the axle instead of spokes. */
  hub: number | null;
}

function layoutGears(): Gear[] {
  const gears: Gear[] = [];
  for (const { teeth, spokes, parent, angle = 0 } of GEAR_SPECS) {
    const pitch = (MODULE * teeth) / 2;
    const shape = {
      d: gearPath(teeth, spokes),
      teeth,
      outer: pitch + MODULE,
      axle: axleRadius(pitch) - 0.9,
      hub: spokes ? null : pitch * 0.42,
    };
    const from = parent === undefined ? undefined : gears[parent];
    if (!from) {
      gears.push({ ...DRIVER_CENTER, ...shape, base: 0, turn: 1 });
      continue;
    }
    const distance = (MODULE * from.teeth) / 2 + pitch;
    const rad = (angle * Math.PI) / 180;
    // Teeth of the parent facing this gear (fractional count from the parent's tooth 0). A tooth
    // there needs a gap here, so the two counts add up to half a tooth.
    const facing = ((angle - from.base) * from.teeth) / 360;
    gears.push({
      x: from.x + distance * Math.cos(rad),
      y: from.y + distance * Math.sin(rad),
      ...shape,
      base: angle + 180 - (360 / teeth) * (0.5 - facing),
      turn: from.turn === 1 ? -1 : 1,
    });
  }
  return gears;
}

const GEARS = layoutGears();

/** Point on a gear's rim at `angle` degrees, where a bolt hits it. */
function rimPoint(gear: Gear, angle: number): Point {
  const rad = (angle * Math.PI) / 180;
  return { x: gear.x + gear.outer * Math.cos(rad), y: gear.y + gear.outer * Math.sin(rad) };
}

/** Sideways kinks along the bolt (in viewBox units at each fifth of its length). */
const BOLT_KINKS = [0, 7, -5, 6, -3, 0];

function boltPoints(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return BOLT_KINKS.map((kink, i) => {
    const t = i / (BOLT_KINKS.length - 1);
    const x = from.x + dx * t - (dy / length) * kink;
    const y = from.y + dy * t + (dx / length) * kink;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

/**
 * Bolts start just under the number (top right, always covered by it whatever its width) and hit
 * a gear's rim (`tip`, where the spark flashes). They take turns, one per pulse.
 */
const BOLTS = [
  { from: { x: 168, y: 4 }, tip: rimPoint(GEARS[2]!, -28) },
  { from: { x: 214, y: 4 }, tip: rimPoint(GEARS[4]!, -80) },
  { from: { x: 190, y: 4 }, tip: rimPoint(GEARS[1]!, -40) },
].map(({ from, tip }) => ({ points: boltPoints(from, tip), tip }));

export function PowerCard({ energyWh, pulseMs, fact = null, variant = 'card' }: PowerCardProps) {
  const { value, unit } = formatEnergy(energyWh);
  const idle = pulseMs === null;
  const compact = variant === 'compact';
  const style = idle ? undefined : ({ '--pulse': `${pulseMs}ms` } as CSSProperties);
  const className = ['power-card', compact && 'power-card--compact', idle && 'power-card--idle']
    .filter(Boolean)
    .join(' ');

  const reading = (
    <p className="power-card-value">
      {value}
      <span className="power-card-unit">{unit}</span>
    </p>
  );

  const scene = (
    <svg className="power-card-scene" viewBox="0 0 240 170" aria-hidden="true">
      {GEARS.map(({ x, y, d, teeth, base, turn, axle, hub }) => (
        <g key={`${x},${y}`} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
          <g transform={`rotate(${base.toFixed(2)})`}>
            {/* Two layers, so the loop never snaps back: the outer one jumps a tooth ahead
                exactly when the inner ratchet step restarts from 0 (components.css). */}
            <g
              className="power-gear-advance"
              style={{ '--gear-teeth': teeth, '--gear-turn': `${turn * 360}deg` } as CSSProperties}
            >
              <g
                className="power-gear"
                style={{ '--gear-step': `${(turn * 360) / teeth}deg` } as CSSProperties}
              >
                <path className="power-gear-body" d={d} />
              </g>
            </g>
          </g>
          {hub !== null && <circle className="power-gear-hub" r={hub} />}
          <circle className="power-gear-axle" r={axle} />
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
  );

  return (
    <article className={className} style={style}>
      <h2 className="power-card-label">
        {compact ? (
          <>
            <Zap aria-hidden="true" />
            Energy
          </>
        ) : (
          <ImpactBadge kind="power" />
        )}
      </h2>
      {compact ? (
        <>
          {reading}
          {scene}
        </>
      ) : (
        <div className="power-card-stage">
          {reading}
          {scene}
          <ImpactFact comparison={fact} />
        </div>
      )}
    </article>
  );
}
