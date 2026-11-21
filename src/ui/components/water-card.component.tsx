/**
 * WaterCard: water used in the selected timeframe. Drops gather at the number's left side and
 * fly off in an arc, round end first, into a pond that drains through a stream out of the card.
 * The number wobbles like liquid as each drop tears off. Drip rate and pond level come in as
 * props, the motion itself is CSS (`--drip`). Only the arc is measured, because it runs from the
 * number (HTML, any width) to the pond (scaled SVG). The popup strip starts at the number, so
 * there the drop leaves its right side on a fixed arc.
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

import { Droplet } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { SelectedFactComparison } from '../app/pages/facts.helpers';
import { formatWater } from '../format.helpers';
import { ImpactBadge } from './impact-badge.component';
import { ImpactFact } from './impact-fact.component';

interface WaterCardProps {
  /** `undefined` while loading. */
  waterMl: number | undefined;
  /** Time between two drops. `null` = no usage, no drops. */
  dripMs: number | null;
  /** Pond water size, 0..1 of the banks. */
  pondFill: number;
  /** Fun fact under the scene (Dashboard). `null` while loading or omitted in compact mode. */
  fact?: SelectedFactComparison | null;
  /** `card` = Dashboard vertical tile with corner badge; `compact` = popup horizontal tile. */
  variant?: 'card' | 'compact';
}

// Scene geometry in viewBox units (240 × 170), front bank near the shared ground line (y ≈ 160).

/**
 * Pond banks seen from slightly above, two lobes like a natural pond. Open at the stream mouth
 * (172,111 → 176,140), so the stroke doesn't cross the outflow.
 */
const POND_BANK =
  'M172 111 C162 102 142 99 124 103 C116 104 112 106 108 106 C98 100 82 99 68 104 ' +
  'C46 104 28 116 30 132 C31 142 36 148 46 152 C62 159 90 160 110 154 C134 158 162 154 176 140';
/** The banks closed across the mouth: the pond bed and, scaled, the water. */
const POND_BED = `${POND_BANK} C182 132 180 118 172 111 Z`;
/** Middle of the pond (its bounding box, which the water scales around). */
const POND_CENTER = { x: 104, y: 130 };

/** Stream banks from the mouth to far beyond the card's right edge, where the tile clips them. */
const STREAM_TOP = 'M172 111 C188 113 200 109 214 111 C228 113 244 108 260 110 H1000';
const STREAM_BOTTOM = 'M176 140 C192 138 206 142 220 140 C234 138 248 144 264 142 H1000';
/** Water between the banks, closed back through the mouth into the pond. */
const STREAM_WATER =
  `${STREAM_TOP} V142 H264 C248 144 234 138 220 140 C206 142 192 138 176 140 ` +
  'C166 130 166 118 172 111 Z';
/** Current lines drifting down the stream (dash patterns in components.css). */
const STREAM_CURRENTS = [
  'M180 119 C196 120 208 117 222 119 C238 121 250 116 266 118 H1000',
  'M184 132 C200 131 212 134 226 132 C240 130 252 135 268 133 H1000',
];

/** Short light glints on the water, swaying with it. */
const GLINTS = [
  'M58 122 q8 -2 16 0',
  'M120 116 q7 -2 14 0',
  'M136 142 q9 -2 18 0',
  'M78 146 q6 -2 12 0',
];

/** Grass tufts on the banks (base points). */
const TUFTS = [
  { x: 58, y: 104 },
  { x: 84, y: 101 },
  { x: 138, y: 101 },
  { x: 158, y: 104 },
  { x: 40, y: 150 },
  { x: 236, y: 109 },
];
const TUFT_PATH = 'M0 0 Q-3 -5 -7 -8 M0 0 Q-1 -7 1 -12 M0 0 Q3 -5 7 -9';

/** Lily pad (notched disc) floating on the left lobe. */
const LILY = { x: 60, y: 136 };
const LILY_PATH = 'M0 0 L7 -2.5 A8 3.6 0 1 1 7 2.5 Z';

const VIEW_WIDTH = 240;

/**
 * Teardrop (px) pointing along +x: tip at 0,6, round end centered at 12,6. The motion path turns
 * +x into the direction of travel, so the round end always leads.
 */
const DROP_PATH = 'M0 6 C4 5.2 7.5 0 12 0 A6 6 0 0 1 12 12 C7.5 12 4 6.8 0 6 Z';
/** Tip to the round end's center (the point that rides the path), px. */
const DROP_REACH = 12;
/** Where the drop hangs on the number: tip this far into its box, at this share of its height. */
const DROP_HOLD = { inset: 1, height: 0.55 };
/** Kick at the tear-off (px): at least this far left and this far up, so the arc reads. */
const DROP_KICK = { x: 24, y: 12 };
/** Where its round end meets the water (left lobe, inside the water at any fill level). */
const DROP_LAND = { x: 84, y: 127 };

/** Crown splash droplets: where each one lands sideways and how high it jumps. */
const SPLASHES = [
  { x: -11, h: -8 },
  { x: -5, h: -13 },
  { x: 5, h: -12 },
  { x: 12, h: -7 },
];

/**
 * Popup strip (300 × 84, 1 unit = 1px, x = 0 at the number's right edge): the same pond and
 * stream, shrunk into the row's lower part and shifted so the pond sits just right of the number
 * and the stream drains off to the right edge.
 */
const COMPACT_POND = { x: 7.5, y: -12.5, scale: 0.55 };

/**
 * The popup drop's arc in strip px: the round end starts just off the number's right edge (the
 * tip on the number, at about its middle), the drop is kicked up and to the right and falls onto
 * DROP_LAND in the shrunk pond. Fixed, because the strip always starts at the number.
 */
const COMPACT_DROP_PATH = (() => {
  const f = (n: number) => n.toFixed(1);
  const land = {
    x: COMPACT_POND.x + DROP_LAND.x * COMPACT_POND.scale,
    y: COMPACT_POND.y + DROP_LAND.y * COMPACT_POND.scale,
  };
  return `M0 39 Q30 0 ${f(land.x)} ${f(land.y)}`;
})();

/** Only one WaterCard is ever on a page, so a fixed id is unique. */
const CLIP_ID = 'water-card-pond';

interface Point {
  x: number;
  y: number;
}

/** Quadratic arc: leaves to the left and a little up, then falls steeply onto the water. */
function arcPath(start: Point, land: Point): string {
  const control = {
    x: Math.min(start.x - DROP_KICK.x, start.x + (land.x - start.x) * 0.7),
    y: start.y - DROP_KICK.y,
  };
  const f = (n: number) => n.toFixed(1);
  return `M${f(start.x)} ${f(start.y)} Q${f(control.x)} ${f(control.y)} ${f(land.x)} ${f(land.y)}`;
}

/**
 * The drop's motion path in stage px, from the number's left edge to the landing point in the
 * scene. Re-measured whenever the stage or the number changes size (resize, font load, new value).
 */
function useDropPath(
  stageRef: RefObject<HTMLDivElement | null>,
  valueRef: RefObject<HTMLParagraphElement | null>,
  sceneRef: RefObject<SVGSVGElement | null>,
  enabled: boolean,
): string | null {
  const [path, setPath] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    const stage = stageRef.current;
    const value = valueRef.current;
    const scene = sceneRef.current;
    if (!stage || !value || !scene) return;

    const measure = () => {
      const stageBox = stage.getBoundingClientRect();
      const sceneBox = scene.getBoundingClientRect();
      // Rendered vs. layout size: the page-open animation scales the tile a little.
      const k = stageBox.width / stage.offsetWidth || 1;
      const unit = sceneBox.width / k / VIEW_WIDTH;
      const start = {
        x: value.offsetLeft + DROP_HOLD.inset - DROP_REACH,
        y: value.offsetTop + value.offsetHeight * DROP_HOLD.height,
      };
      const land = {
        x: (sceneBox.left - stageBox.left) / k + DROP_LAND.x * unit,
        y: (sceneBox.top - stageBox.top) / k + DROP_LAND.y * unit,
      };
      setPath(arcPath(start, land));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(value);
    return () => observer.disconnect();
  }, [stageRef, valueRef, sceneRef, enabled]);

  return enabled ? path : null;
}

export function WaterCard({
  waterMl,
  dripMs,
  pondFill,
  fact = null,
  variant = 'card',
}: WaterCardProps) {
  const { value, unit } = formatWater(waterMl);
  const idle = dripMs === null;
  const compact = variant === 'compact';
  const stageRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLParagraphElement>(null);
  const sceneRef = useRef<SVGSVGElement>(null);
  const dropPath = useDropPath(stageRef, valueRef, sceneRef, !compact);
  const style = {
    '--pond-fill': pondFill.toFixed(3),
    ...(idle ? {} : { '--drip': `${dripMs}ms` }),
  } as CSSProperties;
  const className = ['water-card', compact && 'water-card--compact', idle && 'water-card--idle']
    .filter(Boolean)
    .join(' ');

  const reading = (
    <p className="water-card-value" ref={valueRef}>
      {value}
      <span className="water-card-unit">{unit}</span>
    </p>
  );

  // The popup strip is wider than any visible scene and exactly as tall as the row, so `slice`
  // keeps 1 unit = 1px, starts it at the number and cuts it off on the right.
  const scene = (
    <svg
      className="water-card-scene"
      viewBox={compact ? '0 0 300 84' : `0 0 ${VIEW_WIDTH} 170`}
      preserveAspectRatio={compact ? 'xMinYMid slice' : undefined}
      aria-hidden="true"
      ref={sceneRef}
    >
      <g
        transform={
          compact
            ? `translate(${COMPACT_POND.x} ${COMPACT_POND.y}) scale(${COMPACT_POND.scale})`
            : undefined
        }
      >
        <defs>
          <clipPath id={CLIP_ID}>
            <path className="water-pond-clip" d={POND_BED} />
          </clipPath>
        </defs>
        <path className="water-pond-bed" d={POND_BED} />
        <path className="water-stream" d={STREAM_WATER} />
        {STREAM_CURRENTS.map((d, index) => (
          <path
            key={d}
            className={`water-current water-current--${index}`}
            d={d}
            pathLength={1000}
          />
        ))}
        <path className="water-pond" d={POND_BED} />
        <g clipPath={`url(#${CLIP_ID})`}>
          <path
            className="water-pond-deep"
            d={POND_BED}
            transform={`translate(${POND_CENTER.x} ${POND_CENTER.y + 3}) scale(0.62) translate(${-POND_CENTER.x} ${-POND_CENTER.y})`}
          />
          {GLINTS.map((d, index) => (
            <path
              key={d}
              className="water-glint"
              d={d}
              style={{ '--glint-index': index } as CSSProperties}
            />
          ))}
        </g>
        <path className="water-bank" d={POND_BANK} />
        <path className="water-bank" d={STREAM_TOP} />
        <path className="water-bank" d={STREAM_BOTTOM} />
        {TUFTS.map(({ x, y }, index) => (
          <g key={`${x},${y}`} transform={`translate(${x} ${y})`}>
            <path
              className="water-tuft"
              d={TUFT_PATH}
              style={{ '--tuft-index': index } as CSSProperties}
            />
          </g>
        ))}
        <g transform={`translate(${LILY.x} ${LILY.y})`}>
          <path className="water-lily" d={LILY_PATH} />
        </g>
        <g transform={`translate(${DROP_LAND.x} ${DROP_LAND.y})`}>
          <ellipse className="water-ripple" rx="18" ry="4.5" />
          <ellipse className="water-ripple water-ripple--late" rx="18" ry="4.5" />
          {SPLASHES.map(({ x, h }) => (
            <circle
              key={x}
              className="water-splash"
              r="1.4"
              style={{ '--splash-x': `${x}px`, '--splash-h': `${h}px` } as CSSProperties}
            />
          ))}
          <circle className="water-jet" r="1.9" />
        </g>
      </g>
    </svg>
  );

  const drop = (path: string | null) =>
    !idle &&
    path !== null && (
      <svg
        className="water-drop"
        viewBox="0 0 18 12"
        style={{ offsetPath: `path('${path}')` }}
        aria-hidden="true"
      >
        <path d={DROP_PATH} />
      </svg>
    );

  return (
    <article className={className} style={style}>
      <h2 className="water-card-label">
        {compact ? (
          <>
            <Droplet aria-hidden="true" />
            Water
          </>
        ) : (
          <ImpactBadge kind="water" />
        )}
      </h2>
      {compact ? (
        <>
          {reading}
          {/* position: relative, so the drop's motion path is in strip px like the scene. */}
          <div className="water-card-strip">
            {scene}
            {drop(COMPACT_DROP_PATH)}
          </div>
        </>
      ) : (
        <div className="water-card-stage" ref={stageRef}>
          {reading}
          {scene}
          {drop(dropPath)}
          <ImpactFact comparison={fact} />
        </div>
      )}
    </article>
  );
}
