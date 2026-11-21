/**
 * FactCard: benchmark card (same flat --bg tile as a HistoryRow) with an ImpactBadge in the
 * corner, the multiplier on its own, then the phrase + plain-language `shortCopy` as one group
 * (technical `equivalent` on hover), an optional virtual-water badge, and the raw numbers in a
 * small box that appears on hover. The benchmark's SVG from `public/icons/` is a faint watermark
 * in the top right.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { Sparkles } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { SelectedFactComparison } from '../app/pages/facts.helpers';
import { VIRTUAL_WATER_TOOLTIP } from '../app/pages/facts.helpers';
import { ImpactBadge } from './impact-badge.component';

/** `wide` = the section's featured (1.5× wide) card, with a slightly larger sentence. */
export type FactCardVariant = 'wide' | 'regular';

interface FactCardProps {
  comparison: SelectedFactComparison;
  variant: FactCardVariant;
  /** Position in the page-open stagger (`--enter-index`, components.css). */
  enterIndex: number;
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
      strokeWidth={1.25}
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

export function FactCard({ comparison, variant, enterIndex }: FactCardProps) {
  const {
    kpi,
    item,
    multiplierText,
    comparisonQualifier,
    formattedUserKpi,
    formattedBenchmarkKpi,
  } = comparison;

  const style = { '--enter-index': enterIndex } as CSSProperties;

  return (
    <article className={`fact-card fact-card--${kpi} fact-card--${variant}`} style={style}>
      <div className="fact-card-backdrop" aria-hidden="true">
        <FactSvgIcon iconPath={item.icon} />
      </div>

      <div className="fact-card-top">
        <ImpactBadge kind={kpi} />
        <div className="fact-card-badges">
          {item.isVirtualWater === true && (
            <span className="fact-card-virtual-badge" title={VIRTUAL_WATER_TOOLTIP}>
              <Sparkles />
              Production footprint
            </span>
          )}
        </div>
      </div>

      <div className="fact-card-body">
        <span className="fact-card-multiplier">{multiplierText}</span>
        {/* The phrase reads straight into the sentence, so the two are one group. */}
        <div className="fact-card-statement">
          <span className="fact-card-qualifier">{comparisonQualifier}</span>
          <h3 className="fact-card-copy" title={item.equivalent}>
            {item.shortCopy}
          </h3>
        </div>
      </div>

      {/* The raw numbers behind the multiplier, shown on hover (always without hover). */}
      <dl className="fact-card-readout">
        <div className="fact-card-readout-row">
          <dt>You used</dt>
          <dd>{formattedUserKpi}</dd>
        </div>
        <div className="fact-card-readout-row">
          <dt>This takes</dt>
          <dd>{formattedBenchmarkKpi}</dd>
        </div>
      </dl>
    </article>
  );
}
