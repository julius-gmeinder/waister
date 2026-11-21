/**
 * FeaturedTipCard: personalized (or starter) hero tile for the Tips page. Same tabs and actions
 * as TipCard, plus a muted data-backed hook above a larger title (like a wide FactCard).
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { TipId, TipItem } from '../app/pages/tips-catalog.helpers';
import { TipCardActions, TipCardTabs } from './tip-card.component';

interface FeaturedTipCardProps {
  tip: TipItem;
  reason: string | null;
  expanded: boolean;
  adopted: boolean;
  onToggleExpand: (id: TipId) => void;
  onToggleAdopt: (id: TipId) => void;
  enterIndex?: number;
}

export function FeaturedTipCard({
  tip,
  reason,
  expanded,
  adopted,
  onToggleExpand,
  onToggleAdopt,
  enterIndex = 0,
}: FeaturedTipCardProps) {
  return (
    <article
      className={`featured-tip-card${adopted ? ' tip-card--adopted' : ''}`}
      style={{ '--enter-index': enterIndex } as CSSProperties}
    >
      <TipCardTabs tip={tip} />

      <div className="tip-card-body">
        <p className="featured-tip-hook">
          <Sparkles aria-hidden="true" />
          <span>{reason ?? 'Starter habit · Top energy savings'}</span>
        </p>
        <h3 className="featured-tip-title">{tip.title}</h3>
        <p className="tip-card-summary">{tip.summary}</p>
      </div>

      <TipCardActions
        tip={tip}
        drawerId={`featured-tip-example-${tip.id}`}
        expanded={expanded}
        adopted={adopted}
        onToggleExpand={onToggleExpand}
        onToggleAdopt={onToggleAdopt}
      />
    </article>
  );
}
