/**
 * Co2Card: CO2 emitted in the selected timeframe. A factory chimney puffs small clouds and two
 * cooling towers wide ones, each pushed up its stack as a bulge that pops out at the top. Every
 * cloud picks a random stack, size and drift on each loop, so the stacks spew at random while the
 * stream as a whole keeps the usage-driven rate, and every puff sends a toxic haze off the number.
 * The puff rate comes in as props, the motion itself is CSS (`--puff`). The popup lays the works
 * out as a low skyline beside the number.
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

interface Point {
  x: number;
  y: number;
}

interface Tower {
  cx: number;
  top: number;
  foot: number;
  rim: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bulge size per stack kind: its height and how far it pushes the walls out. */
interface BulgeSize {
  ry: number;
  push: number;
}

/**
 * One scene layout in viewBox units. The stacks (chimney, then each tower) are derived from it,
 * so clouds and bulges work the same in both layouts.
 */
interface SceneSpec {
  viewBox: string;
  /** Ground line height, where the towers stand. */
  groundY: number;
  /** Ground line ends (x). */
  ground: readonly [number, number];
  /** Halls and sheds as closed paths. */
  buildings: readonly string[];
  windows: readonly Box[];
  /** Chimney shaft, plus its cap height and the band and beacon offsets from its top. */
  chimney: {
    x: number;
    width: number;
    top: number;
    base: number;
    cap: number;
    bands: readonly number[];
    beacon: number;
  };
  towers: readonly Tower[];
  /** Rim ellipse height, and how far below the rim the band runs. */
  rimRy: number;
  band: number;
  /** Per stack (chimney first): where its clouds end, relative to the opening, and pick chance. */
  rises: readonly number[];
  weights: readonly number[];
  bulge: { smoke: BulgeSize; steam: BulgeSize };
  /** Cloud size and drift factor, so the clouds stay in proportion to the stacks. */
  cloudScale: number;
}

/**
 * Dashboard scene (240 × 170, scales with the card), ground at the same height as the other
 * cards: sawtooth hall on the left, the chimney rises from its right end, two cooling towers.
 */
const CARD_SPEC: SceneSpec = {
  viewBox: '0 0 240 170',
  groundY: 160,
  ground: [14, 226],
  buildings: ['M22 160 V128 L42 116 V128 L62 116 V128 L82 116 V128 H106 V160 Z'],
  windows: [28, 48, 68].map((x) => ({ x, y: 139, width: 10, height: 9 })),
  chimney: { x: 88, width: 11, top: 50, base: 128, cap: 5, bands: [20, 34], beacon: 11 },
  towers: [
    { cx: 152, top: 76, foot: 27, rim: 17 },
    { cx: 202, top: 98, foot: 21, rim: 13 },
  ],
  rimRy: 2.6,
  band: 9,
  rises: [-48, -64, -58],
  weights: [0.4, 0.33, 0.27],
  bulge: { smoke: { ry: 4.5, push: 3.5 }, steam: { ry: 7, push: 5.5 } },
  cloudScale: 1,
};

/**
 * Popup strip (300 × 84, 1 unit = 1px, x = 0 at the number's right edge): the same works laid
 * out as a low skyline along the row (hall and chimney, two towers, a shed), set off a little
 * from the number. The tile clips whatever runs past its right edge.
 */
const COMPACT_SPEC: SceneSpec = {
  viewBox: '0 0 300 84',
  groundY: 76,
  ground: [16, 300],
  buildings: [
    'M18 76 V60 L29 53 V60 L40 53 V60 L51 53 V60 H66 V76 Z',
    'M137 76 V63 L147 58 H174 V76 Z',
  ],
  windows: [
    ...[21, 32, 43].map((x) => ({ x, y: 64, width: 6, height: 6 })),
    ...[143, 153, 163].map((x) => ({ x, y: 66, width: 6, height: 5 })),
  ],
  chimney: { x: 55, width: 7, top: 26, base: 60, cap: 4, bands: [10, 19], beacon: 6 },
  towers: [
    { cx: 90, top: 38, foot: 16, rim: 10 },
    { cx: 120, top: 48, foot: 13, rim: 8 },
  ],
  rimRy: 1.8,
  band: 5,
  rises: [-20, -26, -30],
  weights: [0.4, 0.33, 0.27],
  bulge: { smoke: { ry: 3, push: 2.5 }, steam: { ry: 4.5, push: 3.5 } },
  cloudScale: 0.7,
};

/**
 * A tower's right flank as a cubic bezier, x as the distance from its center: wide foot, waist
 * about two thirds up, slight flare at the rim (hyperbolic cooling tower).
 */
function towerFlank({ top, foot, rim }: Tower, groundY: number): [Point, Point, Point, Point] {
  const height = groundY - top;
  return [
    { x: foot, y: groundY },
    { x: foot * 0.7, y: groundY - height * 0.35 },
    { x: rim * 0.88, y: top + height * 0.3 },
    { x: rim, y: top },
  ];
}

function towerPath(tower: Tower, groundY: number): string {
  const { cx } = tower;
  const [p0, p1, p2, p3] = towerFlank(tower, groundY);
  return (
    `M${cx - p0.x} ${p0.y} C${cx - p1.x} ${p1.y} ${cx - p2.x} ${p2.y} ${cx - p3.x} ${p3.y} ` +
    `H${cx + p3.x} C${cx + p2.x} ${p2.y} ${cx + p1.x} ${p1.y} ${cx + p0.x} ${p0.y} Z`
  );
}

/** Half-width of a tower at height `y` (the flank's y falls steadily, so bisect its t). */
function towerHalfWidth(tower: Tower, groundY: number, y: number): number {
  const [p0, p1, p2, p3] = towerFlank(tower, groundY);
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
 * pushing the walls out by `size.push` (viewBox units).
 */
function bulgeFor(
  bottom: number,
  top: number,
  size: BulgeSize,
  halfWidth: (y: number) => number,
): Bulge {
  const ys = BULGE_STOPS.map((stop) => bottom - (bottom - top) * stop);
  const widths = ys.map((y, index) => halfWidth(y) + (index === 0 ? -1.5 : size.push));
  return { bottom: ys[0]!, rise: top - ys[0]!, rx: Math.max(...widths), ry: size.ry, widths };
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

interface Scene extends SceneSpec {
  stacks: readonly Stack[];
}

function buildScene(spec: SceneSpec): Scene {
  const { chimney, groundY, rises, weights, bulge } = spec;
  return {
    ...spec,
    stacks: [
      {
        kind: 'smoke',
        x: chimney.x + chimney.width / 2,
        y: chimney.top - 2,
        spread: Math.max(0.5, chimney.width / 2 - 4),
        rise: rises[0]!,
        weight: weights[0]!,
        bulge: bulgeFor(chimney.base, chimney.top, bulge.smoke, () => chimney.width / 2),
      },
      ...spec.towers.map((tower, index) => ({
        kind: 'steam' as const,
        x: tower.cx,
        y: tower.top - 1,
        spread: tower.rim * 0.4,
        rise: rises[index + 1]!,
        weight: weights[index + 1]!,
        bulge: bulgeFor(groundY, tower.top, bulge.steam, (y) => towerHalfWidth(tower, groundY, y)),
      })),
    ],
  };
}

const SCENES = { card: buildScene(CARD_SPEC), compact: buildScene(COMPACT_SPEC) };

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

function randomPuff({ stacks, cloudScale }: Scene): Puff {
  let roll = Math.random();
  const stack = stacks.find((candidate) => (roll -= candidate.weight) < 0) ?? stacks[0]!;
  return {
    stack,
    shift: (Math.random() * 2 - 1) * stack.spread,
    rise: stack.rise * between(VARIATION.rise),
    drift: between(VARIATION.drift) * cloudScale,
    grow: between(VARIATION.grow[stack.kind]) * cloudScale,
  };
}

/** One cloud slot: a fixed head start, and the puff it rolled for its current loop. */
interface Slot {
  jitter: number;
  puff: Puff;
}

const newSlot = (scene: Scene): Slot => ({
  jitter: Math.random() * VARIATION.jitter,
  puff: randomPuff(scene),
});

/**
 * The stacks' walls, drawn twice: a thick outline under the bulges, the fill over them. The fill
 * hides the outline's inner half and every bit of a bulge inside the walls, so a bulge only shows
 * where it pushes the walls out, and covers the outline there.
 */
function StackWalls({ scene, layer }: { scene: Scene; layer: 'outline' | 'body' }) {
  const className = layer === 'outline' ? 'co2-stack-outline' : 'co2-stack-body';
  const { chimney, towers, groundY } = scene;
  return (
    <>
      {towers.map((tower) => (
        <path key={tower.cx} className={className} d={towerPath(tower, groundY)} />
      ))}
      <rect
        className={className}
        x={chimney.x}
        y={chimney.top}
        width={chimney.width}
        height={chimney.base - chimney.top}
      />
    </>
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
  const layout = SCENES[variant];
  const style = idle
    ? undefined
    : ({ '--puff': `${puffMs}ms`, '--cloud-count': cloudCount } as CSSProperties);
  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: cloudCount }, () => newSlot(layout)),
  );
  // More CO2 (another timeframe) needs more slots; the existing ones keep their place.
  if (slots.length < cloudCount) {
    setSlots([
      ...slots,
      ...Array.from({ length: cloudCount - slots.length }, () => newSlot(layout)),
    ]);
  }
  const active = idle ? [] : slots.slice(0, cloudCount);
  // A slot re-rolls its stack and shape when its loop restarts (cloud and bulge are invisible
  // then), without touching the animation, so its place in the stream stays.
  const reroll = (index: number) =>
    setSlots((current) =>
      current.map((slot, i) => (i === index ? { ...slot, puff: randomPuff(layout) } : slot)),
    );
  const className = ['co2-card', compact && 'co2-card--compact', idle && 'co2-card--idle']
    .filter(Boolean)
    .join(' ');
  const { chimney, towers, rimRy, band, groundY, ground } = layout;

  const reading = (
    <p className="co2-card-value">
      {value}
      <span className="co2-card-unit">{unit}</span>
    </p>
  );

  // The popup strip is wider than any visible scene and exactly as tall as the row, so `slice`
  // keeps 1 unit = 1px, starts it at the number and cuts it off on the right.
  const scene = (
    <svg
      className="co2-card-scene"
      viewBox={layout.viewBox}
      preserveAspectRatio={compact ? 'xMinYMid slice' : undefined}
      aria-hidden="true"
    >
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
      <StackWalls scene={layout} layer="outline" />
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
      <StackWalls scene={layout} layer="body" />
      {towers.map(({ cx, top, rim }) => (
        <g key={cx}>
          <ellipse className="co2-tower" cx={cx} cy={top} rx={rim} ry={rimRy} />
          <path
            className="co2-tower-band"
            d={`M${cx - rim * 0.9} ${top + band} Q${cx} ${top + band + 2.5} ${cx + rim * 0.9} ${top + band}`}
          />
        </g>
      ))}
      <rect
        className="co2-factory"
        x={chimney.x - 2}
        y={chimney.top}
        width={chimney.width + 4}
        height={chimney.cap}
      />
      {chimney.bands.map((offset) => (
        <path
          key={offset}
          className="co2-chimney-band"
          d={`M${chimney.x} ${chimney.top + offset} h${chimney.width}`}
        />
      ))}
      <circle
        className="co2-beacon"
        cx={chimney.x + chimney.width / 2}
        cy={chimney.top + chimney.beacon}
        r="1.6"
      />
      {layout.buildings.map((d) => (
        <path key={d} className="co2-factory" d={d} />
      ))}
      {layout.windows.map(({ x, y, width, height }) => (
        <rect key={`${x},${y}`} className="co2-window" x={x} y={y} width={width} height={height} />
      ))}
      <path className="co2-ground" d={`M${ground[0]} ${groundY} H${ground[1]}`} />
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
