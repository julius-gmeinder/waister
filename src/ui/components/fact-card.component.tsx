/**
 * FactCard: glassmorphic benchmark card pairing an SVG icon from `public/icons/` inside a tinted
 * medallion with a bold comparison multiplier, plain-language `shortCopy`, optional virtual-water
 * badge, and exact raw KPI readout.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { Sparkles } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { SelectedFactComparison } from '../app/pages/facts.helpers';
import { VIRTUAL_WATER_TOOLTIP } from '../app/pages/facts.helpers';

export type FactCardVariant = 'hero' | 'compact' | 'stagger' | 'ribbon';

interface FactCardProps {
  comparison: SelectedFactComparison;
  variant: FactCardVariant;
  /** Card index (0..8) used for smooth staggered entrance/shuffle transitions. */
  staggerIndex: number;
  /** Incremented on each shuffle to trigger the card's entrance transition. */
  shuffleGeneration: number;
}

interface ParsedSvgNode {
  tag: string;
  attrs: Record<string, string>;
}

const ALLOWED_SVG_TAGS = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);

/** Module-level cache of parsed SVG nodes keyed by relative icon path (`icons/*.svg`). */
const svgNodeCache = new Map<string, ParsedSvgNode[]>();

function parseSvgMarkup(svgText: string): ParsedSvgNode[] {
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return [];

  const nodes: ParsedSvgNode[] = [];
  for (const child of Array.from(svgEl.children)) {
    const tag = child.tagName.toLowerCase();
    if (!ALLOWED_SVG_TAGS.has(tag)) continue;
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(child.attributes)) {
      attrs[attr.name] = attr.value;
    }
    nodes.push({ tag, attrs });
  }
  return nodes;
}

/**
 * Renders the linked SVG from `icons/*.svg` as an inline `<svg stroke="currentColor">` so it
 * natively inherits the KPI theme accent color without hardcoded hex fills or CSP violations.
 */
function FactSvgIcon({ iconPath }: { iconPath: string }) {
  const normalizedPath = `/${iconPath.replace(/^\//, '')}`;
  const [nodes, setNodes] = useState<ParsedSvgNode[] | null>(
    () => svgNodeCache.get(normalizedPath) ?? null,
  );

  useEffect(() => {
    const cached = svgNodeCache.get(normalizedPath);
    if (cached) {
      setNodes(cached);
      return;
    }

    let cancelled = false;
    void fetch(normalizedPath)
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (cancelled || !text) return;
        const parsed = parseSvgMarkup(text);
        if (parsed.length > 0) {
          svgNodeCache.set(normalizedPath, parsed);
          setNodes(parsed);
        }
      })
      .catch(() => {
        // Fallback <img> stays visible if fetch is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedPath]);

  if (!nodes || nodes.length === 0) {
    return <img className="fact-card-icon-img" src={normalizedPath} alt="" />;
  }

  return (
    <svg
      className="fact-card-icon-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {nodes.map((node, idx) => {
        const Tag = node.tag as 'path';
        return <Tag key={`${node.tag}-${idx}`} {...node.attrs} />;
      })}
    </svg>
  );
}

export function FactCard({ comparison, variant, staggerIndex, shuffleGeneration }: FactCardProps) {
  const {
    kpi,
    kpiLabel,
    item,
    isBaselineZero,
    multiplierText,
    comparisonQualifier,
    formattedUserKpi,
    formattedBenchmarkKpi,
  } = comparison;

  const style = {
    '--fact-stagger': `${staggerIndex * 45}ms`,
  } as CSSProperties;

  return (
    <article
      key={`${item.id}-${shuffleGeneration}`}
      className={`fact-card fact-card--${kpi} fact-card--${variant}`}
      style={style}
    >
      <div className="fact-card-top">
        <div className="fact-card-medallion" aria-hidden="true">
          <FactSvgIcon iconPath={item.icon} />
        </div>

        <div className="fact-card-badges">
          <span className="fact-card-kpi-pill">{kpiLabel}</span>
          {item.isVirtualWater === true && (
            <span className="fact-card-virtual-badge" title={VIRTUAL_WATER_TOOLTIP}>
              <Sparkles />
              Production footprint
            </span>
          )}
        </div>
      </div>

      <div className="fact-card-body">
        <div className="fact-card-multiplier-row">
          <span className="fact-card-multiplier">{multiplierText}</span>
          <span className="fact-card-qualifier">{comparisonQualifier}</span>
        </div>

        <h3 className="fact-card-copy">{item.shortCopy}</h3>
        <p className="fact-card-equivalent">{item.equivalent}</p>
      </div>

      <footer className="fact-card-footer">
        <span className="fact-card-readout-user">
          {isBaselineZero ? `0 used so far (${formattedUserKpi})` : `${formattedUserKpi} used`}
        </span>
        <span className="fact-card-readout-sep" aria-hidden="true">
          ·
        </span>
        <span className="fact-card-readout-bench">1× = {formattedBenchmarkKpi}</span>
      </footer>
    </article>
  );
}
