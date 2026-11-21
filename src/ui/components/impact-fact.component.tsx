/**
 * ImpactFact: one everyday benchmark under a dashboard card's scene, worded like a FactCard: the
 * multiplier in the KPI accent, the phrase, then the plain-language `shortCopy` (technical
 * `equivalent` on hover). Keeps its height while loading, so the cards don't jump.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { SelectedFactComparison } from '../app/pages/facts.helpers';

interface ImpactFactProps {
  /** `null` while loading. */
  comparison: SelectedFactComparison | null;
}

export function ImpactFact({ comparison }: ImpactFactProps) {
  if (!comparison) return <p className="impact-fact" aria-hidden="true" />;

  const { kpi, item, multiplierText, comparisonQualifier } = comparison;
  return (
    <p className={`impact-fact impact-fact--${kpi}`} title={item.equivalent}>
      <span className="impact-fact-lead">
        <span className="impact-fact-multiplier">{multiplierText}</span>{' '}
        <span className="impact-fact-qualifier">{comparisonQualifier}</span>
      </span>
      <span className="impact-fact-copy">{item.shortCopy}</span>
    </p>
  );
}
