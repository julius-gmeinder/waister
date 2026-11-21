/**
 * TipCard: scannable habit tile for the Tips page grid. Uses the shared flush top-left corner tab
 * (matching ImpactBadge), a top-right category tag, compact title + one-sentence summary, inline
 * "Instead of / Try this" comparison drawer, and persisted adopt toggle.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { Check, ChevronDown, Leaf, Zap } from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  TIP_CATEGORY_LABELS,
  TIP_IMPACT_LABELS,
  type TipId,
  type TipItem,
} from '../app/pages/tips-catalog.helpers';

interface TipCardProps {
  tip: TipItem;
  expanded: boolean;
  adopted: boolean;
  onToggleExpand: (id: TipId) => void;
  onToggleAdopt: (id: TipId) => void;
  enterIndex?: number;
}

export function TipCard({
  tip,
  expanded,
  adopted,
  onToggleExpand,
  onToggleAdopt,
  enterIndex = 0,
}: TipCardProps) {
  const drawerId = `tip-example-${tip.id}`;
  const isHigh = tip.impact === 'high';
  const TabIcon = isHigh ? Zap : Leaf;

  return (
    <article
      className={`tip-card${adopted ? ' tip-card--adopted' : ''}`}
      style={{ '--enter-index': enterIndex } as CSSProperties}
    >
      <span
        className={
          isHigh ? 'tip-impact-tab tip-impact-tab--high' : 'tip-impact-tab tip-impact-tab--quick'
        }
      >
        <TabIcon aria-hidden="true" />
        {TIP_IMPACT_LABELS[tip.impact]}
      </span>
      <span className="tip-corner-tag">{TIP_CATEGORY_LABELS[tip.category]}</span>

      <div className="tip-card-body">
        <h3 className="tip-card-title">{tip.title}</h3>
        <p className="tip-card-summary">{tip.summary}</p>
      </div>

      {expanded && (
        <div id={drawerId} className="tip-example-drawer">
          <div className="tip-example-row">
            <span className="tip-example-label tip-example-label--instead">Instead of:</span>
            <p className="tip-example-text">{tip.example.insteadOf}</p>
          </div>
          <div className="tip-example-row">
            <span className="tip-example-label tip-example-label--try">Try this:</span>
            <p className="tip-example-text">{tip.example.tryThis}</p>
          </div>
        </div>
      )}

      <div className="tip-card-footer">
        <button
          type="button"
          className="tip-card-disclosure"
          aria-expanded={expanded}
          aria-controls={drawerId}
          onClick={() => onToggleExpand(tip.id)}
        >
          <span>{expanded ? 'Hide example' : 'See example'}</span>
          <ChevronDown
            aria-hidden="true"
            className={expanded ? 'tip-card-chevron tip-card-chevron--open' : 'tip-card-chevron'}
          />
        </button>

        <button
          type="button"
          className="tip-card-adopt"
          aria-pressed={adopted}
          onClick={() => onToggleAdopt(tip.id)}
        >
          {adopted && <Check aria-hidden="true" />}
          <span>{adopted ? 'Adopted' : 'I do this'}</span>
        </button>
      </div>
    </article>
  );
}
