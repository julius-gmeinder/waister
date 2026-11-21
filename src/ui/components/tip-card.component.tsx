/**
 * TipCard: scannable habit tile for the Tips page grid: impact tab top left, mirrored neutral
 * category tab top right, title + one-sentence summary, then the actions row with the example
 * drawer opening below it (so the buttons never move). Also exports the tabs and actions that
 * FeaturedTipCard shares.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import {
  Check,
  ChevronDown,
  Leaf,
  ListChecks,
  MessagesSquare,
  PenLine,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  TIP_CATEGORY_LABELS,
  TIP_IMPACT_LABELS,
  type TipCategoryId,
  type TipId,
  type TipItem,
} from '../app/pages/tips-catalog.helpers';

/** One icon per category, distinct from the token category icons (styling.md#icons). */
const CATEGORY_ICONS: Record<TipCategoryId, LucideIcon> = {
  'before-asking': ListChecks,
  'how-to-ask': PenLine,
  'chat-habits': MessagesSquare,
};

interface TipCardProps {
  tip: TipItem;
  expanded: boolean;
  adopted: boolean;
  onToggleExpand: (id: TipId) => void;
  onToggleAdopt: (id: TipId) => void;
  enterIndex?: number;
}

/** The two corner tabs: impact (accent, top left) and category (neutral, top right). */
export function TipCardTabs({ tip }: { tip: TipItem }) {
  const isHigh = tip.impact === 'high';
  const ImpactIcon = isHigh ? Zap : Leaf;
  const CategoryIcon = CATEGORY_ICONS[tip.category];

  return (
    <>
      <span className={`tip-tab tip-tab--impact tip-tab--${isHigh ? 'high' : 'quick'}`}>
        <ImpactIcon aria-hidden="true" />
        {TIP_IMPACT_LABELS[tip.impact]}
      </span>
      <span className="tip-tab tip-tab--category">
        <CategoryIcon aria-hidden="true" />
        {TIP_CATEGORY_LABELS[tip.category]}
      </span>
    </>
  );
}

interface TipCardActionsProps {
  tip: TipItem;
  drawerId: string;
  expanded: boolean;
  adopted: boolean;
  onToggleExpand: (id: TipId) => void;
  onToggleAdopt: (id: TipId) => void;
}

/** Buttons first, drawer below: opening the example grows the tile downward only. */
export function TipCardActions({
  tip,
  drawerId,
  expanded,
  adopted,
  onToggleExpand,
  onToggleAdopt,
}: TipCardActionsProps) {
  return (
    <div className="tip-card-actions">
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

      {expanded && (
        <div id={drawerId} className="tip-example-drawer">
          <div className="tip-example-row">
            <span className="tip-example-label tip-example-label--instead">Instead of</span>
            <p className="tip-example-text">{tip.example.insteadOf}</p>
          </div>
          <div className="tip-example-row">
            <span className="tip-example-label tip-example-label--try">Try this</span>
            <p className="tip-example-text">{tip.example.tryThis}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function TipCard({
  tip,
  expanded,
  adopted,
  onToggleExpand,
  onToggleAdopt,
  enterIndex = 0,
}: TipCardProps) {
  return (
    <article
      className={`tip-card${adopted ? ' tip-card--adopted' : ''}`}
      style={{ '--enter-index': enterIndex } as CSSProperties}
    >
      <TipCardTabs tip={tip} />

      <div className="tip-card-body">
        <h3 className="tip-card-title">{tip.title}</h3>
        <p className="tip-card-summary">{tip.summary}</p>
      </div>

      <TipCardActions
        tip={tip}
        drawerId={`tip-example-${tip.id}`}
        expanded={expanded}
        adopted={adopted}
        onToggleExpand={onToggleExpand}
        onToggleAdopt={onToggleAdopt}
      />
    </article>
  );
}
