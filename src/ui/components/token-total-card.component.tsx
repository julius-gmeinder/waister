/**
 * TokenTotalCard: the full-width token total tile on the Dashboard and Analytics (big TokenCount,
 * label, muted detail) and the compact horizontal token row in the popup (`variant="compact"`).
 * With `coins`, coins pop out of the number, drop to the card's bottom edge, skip along it and
 * roll off. Pure CSS (`token-coin-*` keyframes).
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

import { Coins } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { TokenCount } from './token-count.component';

/** Coins per cycle; their delays split the cycle evenly (`--coin-count`, components.css). */
const COIN_COUNT = 3;

interface TokenTotalCardProps {
  /** `undefined` while loading. No coins while loading or at 0. */
  tokens: number | undefined;
  label: string;
  detail?: ReactNode;
  /** Optional pill in the top-right corner (Analytics: change vs. the previous period). */
  corner?: ReactNode;
  /** Coin animation on (Dashboard, popup). Off on Analytics, where the tile sits among quiet KPI tiles. */
  coins?: boolean;
  /** `card` = Dashboard / Analytics tile; `compact` = popup horizontal tile with left badge strip. */
  variant?: 'card' | 'compact';
  /** Position in the page-open stagger (`tile-enter`). */
  enterIndex?: number;
}

function Coin() {
  return (
    <svg className="token-coin" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="token-coin-face" cx="12" cy="12" r="10.5" />
      <circle className="token-coin-rim" cx="12" cy="12" r="6.5" />
      {/* An off-center mark, so the roll is visible on a round face. */}
      <path className="token-coin-mark" d="M12 8.5v7" />
    </svg>
  );
}

export function TokenTotalCard({
  tokens,
  label,
  detail,
  corner,
  coins = false,
  variant = 'card',
  enterIndex = 0,
}: TokenTotalCardProps) {
  const moving = coins && tokens !== undefined && tokens > 0;
  const compact = variant === 'compact';

  return (
    <article
      className={compact ? 'token-total-card token-total-card--compact' : 'token-total-card'}
      style={{ '--enter-index': enterIndex } as CSSProperties}
    >
      {compact ? (
        <>
          <h2 className="token-total-card-badge">
            <Coins aria-hidden="true" />
            {label}
          </h2>
          <div className="token-total-card-reading">
            <TokenCount value={tokens} unit={false} />
          </div>
        </>
      ) : (
        <>
          {corner}
          <div className="token-total-card-reading">
            <TokenCount value={tokens} />
          </div>
          <span className="token-total-card-label">{label}</span>
          {detail !== undefined && <p className="token-total-card-detail">{detail}</p>}
        </>
      )}
      {/* The track is the card's last column: from the reading to the right edge, full height. */}
      {moving && (
        <span
          className="token-coins"
          style={{ '--coin-count': COIN_COUNT } as CSSProperties}
          aria-hidden="true"
        >
          {Array.from({ length: COIN_COUNT }, (_, index) => (
            <span
              key={index}
              className="token-coin-run"
              style={{ '--coin-index': index } as CSSProperties}
            >
              <span className="token-coin-hop">
                <Coin />
              </span>
            </span>
          ))}
        </span>
      )}
    </article>
  );
}
