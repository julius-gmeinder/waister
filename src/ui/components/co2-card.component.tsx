/**
 * Co2Card: CO2 emitted in the selected timeframe. A factory chimney puffs dirty smoke and two
 * cooling towers billow steam. Every cloud picks a random stack, size and drift on each loop, so
 * the stacks spew at random while the stream as a whole keeps the usage-driven rate, and every
 * puff sends a toxic haze off the number. The puff rate comes in as props, the motion itself is
 * CSS (`--puff`).
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

import { Factory } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import type { SelectedFactComparison } from '../app/pages/facts.helpers';
import { formatCo2 } from '../format.helpers';
import { ImpactBadge } from './impact-badge.component';
import { ImpactFact } from './impact-fact.component';

interface Co2CardProps {
  /** `undefined` while loading. */
  co2Grams: number | undefined;
  /** Average time between two clouds. `null` = no usage, no smoke. */
  puffMs: number | null;
  /** Clouds in the loop. Each one restarts after `cloudCount × puffMs`, which keeps the stream even. */
  cloudCount: number;
  /** Fun fact under the scene (Dashboard). `null` while loading or omitted in compact mode. */
  fact?: SelectedFactComparison | null;
  /** `card` = Dashboard vertical tile with corner badge; `compact` = popup horizontal tile. */
  variant?: 'card' | 'compact';
}

// Scene geometry in viewBox units (240 × 170), ground at the same height as the other cards.
const GROUND_Y = 160;

/** Sawtooth hall on the left, the chimney rises from its right end. */
const HALL_PATH = `M22 ${GROUND_Y} V128 L42 116 V128 L62 116 V128 L82 116 V128 H106 V${GROUND_Y} Z`;
const WINDOWS = [28, 48, 68];
const CHIMNEY = { x: 88, width: 11, top: 50, base: 128 };

/** Hyperbolic cooling tower: wide foot, waist about two thirds up, slight flare at the rim. */
function towerPath(cx: number, top: number, foot: number, rim: number): string {
  const height = GROUND_Y - top;
  const waist = rim * 0.88;
  return (
    `M${cx - foot} ${GROUND_Y} ` +
    `C${cx - foot * 0.7} ${GROUND_Y - height * 0.35} ${cx - waist} ${top + height * 0.3} ${cx - rim} ${top} ` +
    `H${cx + rim} ` +
    `C${cx + waist} ${top + height * 0.3} ${cx + foot * 0.7} ${GROUND_Y - height * 0.35} ${cx + foot} ${GROUND_Y} Z`
  );
}

const TOWERS = [
  { cx: 152, top: 76, foot: 27, rim: 17 },
  { cx: 202, top: 98, foot: 21, rim: 13 },
];

type StackKind = 'smoke' | 'steam';

interface Stack {
  kind: StackKind;
  /** Where clouds leave the stack. */
  x: number;
  y: number;
  /** Half the opening: clouds start anywhere across it. */
  spread: number;
  /** Where a cloud ends, relative to the opening: up to just below the number row. */
  rise: number;
  /** Chance that a cloud picks this stack. */
  weight: number;
}

const STACKS: readonly Stack[] = [
  {
    kind: 'smoke',
    x: CHIMNEY.x + CHIMNEY.width / 2,
    y: CHIMNEY.top - 2,
    spread: 1.5,
    rise: -48,
    weight: 0.4,
  },
  ...TOWERS.map(({ cx, top, rim }, index) => ({
    kind: 'steam' as const,
    x: cx,
    y: top - 1,
    spread: rim * 0.4,
    rise: index === 0 ? -64 : -58,
    weight: index === 0 ? 0.33 : 0.27,
  })),
];

/** Dense puff of three bumps around 0,0 (chimney smoke), flat bottom. */
const SMOKE_PATH = 'M-7 6 A5 5 0 0 1 -7 -4 A7 7 0 0 1 7 -3.9 A5 5 0 0 1 8 6 Z';
/** Wide, soft billow of four bumps (cooling tower steam). */
const STEAM_PATH =
  'M-12 6 A5 5 0 0 1 -11 -3 A6.5 6.5 0 0 1 -1 -7.5 A7 7 0 0 1 11 -3 A5.5 5.5 0 0 1 12 6 Z';

/** Random variation per cloud loop: how far it rises, drifts with the wind and swells. */
const VARIATION = {
  rise: { min: 0.85, max: 1.15 },
  drift: { min: 3, max: 16 },
  grow: { smoke: { min: 1.2, max: 1.6 }, steam: { min: 1.5, max: 2.1 } },
  /** Head start inside each cloud's slot (share of `--puff`), so the stacks don't tick evenly. */
  jitter: 0.8,
};

const between = ({ min, max }: { min: number; max: number }) => min + Math.random() * (max - min);

interface Puff {
  stack: Stack;
  shift: number;
  rise: number;
  drift: number;
  grow: number;
}

function randomPuff(): Puff {
  let roll = Math.random();
  const stack = STACKS.find((candidate) => (roll -= candidate.weight) < 0) ?? STACKS[0]!;
  return {
    stack,
    shift: (Math.random() * 2 - 1) * stack.spread,
    rise: stack.rise * between(VARIATION.rise),
    drift: between(VARIATION.drift),
    grow: between(VARIATION.grow[stack.kind]),
  };
}

/**
 * One cloud slot. It re-rolls its stack and shape whenever its loop restarts (invisible at that
 * moment), without touching the animation itself, so its place in the stream stays.
 */
function SmokeCloud({ index }: { index: number }) {
  const [jitter] = useState(() => Math.random() * VARIATION.jitter);
  const [puff, setPuff] = useState(randomPuff);
  const { stack, shift, rise, drift, grow } = puff;

  return (
    <g transform={`translate(${(stack.x + shift).toFixed(1)} ${stack.y})`}>
      <path
        className={`co2-cloud co2-cloud--${stack.kind}`}
        d={stack.kind === 'smoke' ? SMOKE_PATH : STEAM_PATH}
        onAnimationIteration={() => setPuff(randomPuff())}
        style={
          {
            '--cloud-index': index + jitter,
            '--cloud-rise': `${rise.toFixed(1)}px`,
            '--cloud-drift': `${drift.toFixed(1)}px`,
            '--cloud-grow': grow.toFixed(2),
          } as CSSProperties
        }
      />
    </g>
  );
}

export function Co2Card({
  co2Grams,
  puffMs,
  cloudCount,
  fact = null,
  variant = 'card',
}: Co2CardProps) {
  const { value, unit } = formatCo2(co2Grams);
  const idle = puffMs === null;
  const compact = variant === 'compact';
  const style = idle
    ? undefined
    : ({ '--puff': `${puffMs}ms`, '--cloud-count': cloudCount } as CSSProperties);
  const clouds = idle ? [] : Array.from({ length: cloudCount }, (_, index) => index);
  const className = ['co2-card', compact && 'co2-card--compact', idle && 'co2-card--idle']
    .filter(Boolean)
    .join(' ');

  const reading = (
    <p className="co2-card-value">
      {value}
      <span className="co2-card-unit">{unit}</span>
    </p>
  );

  const scene = (
    <svg className="co2-card-scene" viewBox="0 0 240 170" aria-hidden="true">
      {/* Clouds first: they start inside the stacks and come out of the top. */}
      {clouds.map((index) => (
        <SmokeCloud key={index} index={index} />
      ))}
      {TOWERS.map(({ cx, top, foot, rim }) => (
        <g key={cx}>
          <path className="co2-tower" d={towerPath(cx, top, foot, rim)} />
          <ellipse className="co2-tower" cx={cx} cy={top} rx={rim} ry={2.6} />
          <path
            className="co2-tower-band"
            d={`M${cx - rim * 0.9} ${top + 9} Q${cx} ${top + 11.5} ${cx + rim * 0.9} ${top + 9}`}
          />
        </g>
      ))}
      <rect
        className="co2-factory"
        x={CHIMNEY.x}
        y={CHIMNEY.top}
        width={CHIMNEY.width}
        height={CHIMNEY.base - CHIMNEY.top}
      />
      <rect
        className="co2-factory"
        x={CHIMNEY.x - 2}
        y={CHIMNEY.top}
        width={CHIMNEY.width + 4}
        height={5}
      />
      {[CHIMNEY.top + 20, CHIMNEY.top + 34].map((y) => (
        <path key={y} className="co2-chimney-band" d={`M${CHIMNEY.x} ${y} h${CHIMNEY.width}`} />
      ))}
      <circle
        className="co2-beacon"
        cx={CHIMNEY.x + CHIMNEY.width / 2}
        cy={CHIMNEY.top + 11}
        r="1.6"
      />
      <path className="co2-factory" d={HALL_PATH} />
      {WINDOWS.map((x) => (
        <rect key={x} className="co2-window" x={x} y={139} width={10} height={9} />
      ))}
      <path className="co2-ground" d={`M14 ${GROUND_Y} H226`} />
    </svg>
  );

  return (
    <article className={className} style={style}>
      <h2 className="co2-card-label">
        {compact ? (
          <>
            <Factory aria-hidden="true" />
            CO₂
          </>
        ) : (
          <ImpactBadge kind="co2" />
        )}
      </h2>
      {compact ? (
        <>
          {reading}
          {scene}
        </>
      ) : (
        <div className="co2-card-stage">
          {reading}
          {scene}
          <ImpactFact comparison={fact} />
        </div>
      )}
    </article>
  );
}
