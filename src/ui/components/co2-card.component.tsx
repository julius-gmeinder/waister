/**
 * Co2Card: CO2 emitted in the selected timeframe. A factory chimney puffs small clouds and two
 * cooling towers wide ones, each pushed up its stack as a bulge that pops out at the top. Every
 * cloud picks a random stack, size and drift on each loop, so the stacks spew at random while the
 * stream as a whole keeps the usage-driven rate, and every puff sends a toxic haze off the number.
 * The puff rate comes in as props, the motion itself is CSS (`--puff`).
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

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
  /** Fun fact under the scene. `null` while loading. */
  fact: SelectedFactComparison | null;
}

interface Point {
  x: number;
  y: number;
}

// Scene geometry in viewBox units (240 × 170), ground at the same height as the other cards.
const GROUND_Y = 160;

/** Sawtooth hall on the left, the chimney rises from its right end. */
const HALL_PATH = `M22 ${GROUND_Y} V128 L42 116 V128 L62 116 V128 L82 116 V128 H106 V${GROUND_Y} Z`;
const WINDOWS = [28, 48, 68];
const CHIMNEY = { x: 88, width: 11, top: 50, base: 128 };

interface Tower {
  cx: number;
  top: number;
  foot: number;
  rim: number;
}

const TOWERS: readonly Tower[] = [
  { cx: 152, top: 76, foot: 27, rim: 17 },
  { cx: 202, top: 98, foot: 21, rim: 13 },
];

/**
 * A tower's right flank as a cubic bezier, x as the distance from its center: wide foot, waist
 * about two thirds up, slight flare at the rim (hyperbolic cooling tower).
 */
function towerFlank({ top, foot, rim }: Tower): [Point, Point, Point, Point] {
  const height = GROUND_Y - top;
  return [
    { x: foot, y: GROUND_Y },
    { x: foot * 0.7, y: GROUND_Y - height * 0.35 },
    { x: rim * 0.88, y: top + height * 0.3 },
    { x: rim, y: top },
  ];
}

function towerPath(tower: Tower): string {
  const { cx } = tower;
  const [p0, p1, p2, p3] = towerFlank(tower);
  return (
    `M${cx - p0.x} ${p0.y} C${cx - p1.x} ${p1.y} ${cx - p2.x} ${p2.y} ${cx - p3.x} ${p3.y} ` +
    `H${cx + p3.x} C${cx + p2.x} ${p2.y} ${cx + p1.x} ${p1.y} ${cx + p0.x} ${p0.y} Z`
  );
}

/** Half-width of a tower at height `y` (the flank's y falls steadily, so bisect its t). */
function towerHalfWidth(tower: Tower, y: number): number {
  const [p0, p1, p2, p3] = towerFlank(tower);
  const at = (t: number, k: 'x' | 'y') =>
    (1 - t) ** 3 * p0[k] +
    3 * (1 - t) ** 2 * t * p1[k] +
    3 * (1 - t) * t ** 2 * p2[k] +
    t ** 3 * p3[k];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid, 'y') > y) lo = mid;
    else hi = mid;
  }
  return at((lo + hi) / 2, 'x');
}

/**
 * Where the bulge passes on its way up (share of the stack's height): it starts a little above
 * the foot and pops out at the top, just before the cloud comes out.
 */
const BULGE_STOPS = [0.12, 0.42, 0.72, 1];

interface Bulge {
  /** Start height (y) and the way up to the top (negative). */
  bottom: number;
  rise: number;
  /** Drawn at the widest stop and only scaled down: scaled-up animated layers render blurry. */
  rx: number;
  ry: number;
  /** Ellipse half-width at each stop. The first one stays inside the walls, so it grows out. */
  widths: readonly number[];
}

/**
 * Bulge from `bottom` to `top` of a stack whose half-width at height y is `halfWidth(y)`,
 * pushing the walls out by `push` (viewBox units).
 */
function bulgeFor(
  bottom: number,
  top: number,
  ry: number,
  push: number,
  halfWidth: (y: number) => number,
): Bulge {
  const ys = BULGE_STOPS.map((stop) => bottom - (bottom - top) * stop);
  const widths = ys.map((y, index) => halfWidth(y) + (index === 0 ? -1.5 : push));
  return { bottom: ys[0]!, rise: top - ys[0]!, rx: Math.max(...widths), ry, widths };
}

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
  bulge: Bulge;
}

const STACKS: readonly Stack[] = [
  {
    kind: 'smoke',
    x: CHIMNEY.x + CHIMNEY.width / 2,
    y: CHIMNEY.top - 2,
    spread: 1.5,
    rise: -48,
    weight: 0.4,
    bulge: bulgeFor(CHIMNEY.base, CHIMNEY.top, 4.5, 3.5, () => CHIMNEY.width / 2),
  },
  ...TOWERS.map((tower, index) => ({
    kind: 'steam' as const,
    x: tower.cx,
    y: tower.top - 1,
    spread: tower.rim * 0.4,
    rise: index === 0 ? -64 : -58,
    weight: index === 0 ? 0.33 : 0.27,
    bulge: bulgeFor(GROUND_Y, tower.top, 7, 5.5, (y) => towerHalfWidth(tower, y)),
  })),
];

/** Small puff of three bumps around 0,0 (chimney), flat bottom. */
const SMOKE_PATH = 'M-7 6 A5 5 0 0 1 -7 -4 A7 7 0 0 1 7 -3.9 A5 5 0 0 1 8 6 Z';
/** Wide billow of four bumps (cooling towers). */
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

/** One cloud slot: a fixed head start, and the puff it rolled for its current loop. */
interface Slot {
  jitter: number;
  puff: Puff;
}

const newSlot = (): Slot => ({ jitter: Math.random() * VARIATION.jitter, puff: randomPuff() });

/**
 * The stacks' walls, drawn twice: a thick outline under the bulges, the fill over them. The fill
 * hides the outline's inner half and every bit of a bulge inside the walls, so a bulge only shows
 * where it pushes the walls out, and covers the outline there.
 */
function StackWalls({ layer }: { layer: 'outline' | 'body' }) {
  const className = layer === 'outline' ? 'co2-stack-outline' : 'co2-stack-body';
  return (
    <>
      {TOWERS.map((tower) => (
        <path key={tower.cx} className={className} d={towerPath(tower)} />
      ))}
      <rect
        className={className}
        x={CHIMNEY.x}
        y={CHIMNEY.top}
        width={CHIMNEY.width}
        height={CHIMNEY.base - CHIMNEY.top}
      />
    </>
  );
}

export function Co2Card({ co2Grams, puffMs, cloudCount, fact }: Co2CardProps) {
  const { value, unit } = formatCo2(co2Grams);
  const idle = puffMs === null;
  const style = idle
    ? undefined
    : ({ '--puff': `${puffMs}ms`, '--cloud-count': cloudCount } as CSSProperties);
  const [slots, setSlots] = useState<Slot[]>(() => Array.from({ length: cloudCount }, newSlot));
  // More CO2 (another timeframe) needs more slots; the existing ones keep their place.
  if (slots.length < cloudCount) {
    setSlots([...slots, ...Array.from({ length: cloudCount - slots.length }, newSlot)]);
  }
  const active = idle ? [] : slots.slice(0, cloudCount);
  // A slot re-rolls its stack and shape when its loop restarts (cloud and bulge are invisible
  // then), without touching the animation, so its place in the stream stays.
  const reroll = (index: number) =>
    setSlots((current) =>
      current.map((slot, i) => (i === index ? { ...slot, puff: randomPuff() } : slot)),
    );

  return (
    <article className={idle ? 'co2-card co2-card--idle' : 'co2-card'} style={style}>
      <h2 className="co2-card-label">
        <ImpactBadge kind="co2" />
      </h2>
      <div className="co2-card-stage">
        <p className="co2-card-value">
          {value}
          <span className="co2-card-unit">{unit}</span>
        </p>
        <svg className="co2-card-scene" viewBox="0 0 240 170" aria-hidden="true">
          {/* Clouds first: they start inside the stacks and come out of the top. */}
          {active.map(({ jitter, puff }, index) => (
            <g
              key={index}
              transform={`translate(${(puff.stack.x + puff.shift).toFixed(1)} ${puff.stack.y})`}
            >
              <path
                className={`co2-cloud co2-cloud--${puff.stack.kind}`}
                d={puff.stack.kind === 'smoke' ? SMOKE_PATH : STEAM_PATH}
                onAnimationIteration={() => reroll(index)}
                style={
                  {
                    '--cloud-index': index + jitter,
                    '--cloud-rise': `${puff.rise.toFixed(1)}px`,
                    '--cloud-drift': `${puff.drift.toFixed(1)}px`,
                    '--cloud-grow': puff.grow.toFixed(2),
                  } as CSSProperties
                }
              />
            </g>
          ))}
          <StackWalls layer="outline" />
          {/* Each slot's bulge shares its cloud's loop (same --cloud-index delay and duration). */}
          {active.map(({ jitter, puff: { stack } }, index) => (
            <g key={index} transform={`translate(${stack.x} ${stack.bulge.bottom.toFixed(1)})`}>
              <ellipse
                className="co2-bulge"
                rx={stack.bulge.rx}
                ry={stack.bulge.ry}
                style={
                  {
                    '--cloud-index': index + jitter,
                    '--bulge-rise': `${stack.bulge.rise.toFixed(1)}px`,
                    ...Object.fromEntries(
                      stack.bulge.widths.map((width, stop) => [
                        `--bulge-w${stop}`,
                        (width / stack.bulge.rx).toFixed(3),
                      ]),
                    ),
                  } as CSSProperties
                }
              />
            </g>
          ))}
          <StackWalls layer="body" />
          {TOWERS.map(({ cx, top, rim }) => (
            <g key={cx}>
              <ellipse className="co2-tower" cx={cx} cy={top} rx={rim} ry={2.6} />
              <path
                className="co2-tower-band"
                d={`M${cx - rim * 0.9} ${top + 9} Q${cx} ${top + 11.5} ${cx + rim * 0.9} ${top + 9}`}
              />
            </g>
          ))}
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
        <ImpactFact comparison={fact} />
      </div>
    </article>
  );
}
