/**
 * TokenTotalCard: the full-width token total tile on the Dashboard and Analytics (big TokenCount,
 * label, muted detail) and the compact horizontal token row in the popup (`variant="compact"`).
 * With `spitMs` (token pulse), the number beats once per `spitMs` and spits a coin out on every
 * beat, which drops to the card's bottom edge, skips along it and rolls off. The rate comes in as
 * props, the motion is CSS (`--spit`, `token-spit` / `token-coin-*` keyframes). At 0 tokens three
 * coins lie still on the bottom edge instead, so the tile isn't empty.
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

import { Coins } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { TokenCount } from './token-count.component';

/** Resting coins at 0 tokens (placed one by one in components.css, `.token-coin-rest`). */
const RESTING_COIN_COUNT = 3;

interface TokenTotalCardProps {
  /** `undefined` while loading. No coins while loading. */
  tokens: number | undefined;
  label: string;
  detail?: ReactNode;
  /** Optional pill in the top-right corner (Analytics: change vs. the previous period). */
  corner?: ReactNode;
  /**
   * Token pulse (Dashboard, popup): time between two coins the number spits out. `null` = no
   * usage, resting coins. Omitted = no coins at all (Analytics, among quiet KPI tiles).
   */
  spitMs?: number | null;
  /** Coins in the loop. Each one restarts after `coinCount × spitMs`, which keeps the beat even. */
  coinCount?: number;
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
  spitMs,
  coinCount = 0,
  variant = 'card',
  enterIndex = 0,
}: TokenTotalCardProps) {
  const moving = typeof spitMs === 'number' && coinCount > 0 && tokens !== undefined && tokens > 0;
  const resting = spitMs !== undefined && tokens === 0;
  const compact = variant === 'compact';
  const classes = ['token-total-card'];
  if (compact) classes.push('token-total-card--compact');
  if (moving) classes.push('token-total-card--spitting');
  const style = {
    '--enter-index': enterIndex,
    ...(moving && { '--spit': `${spitMs}ms`, '--coin-count': coinCount }),
  } as CSSProperties;

  return (
    <article className={classes.join(' ')} style={style}>
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
        <span className="token-coins" aria-hidden="true">
          {Array.from({ length: coinCount }, (_, index) => (
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
      {resting && (
        <span className="token-coins token-coins--rest" aria-hidden="true">
          {Array.from({ length: RESTING_COIN_COUNT }, (_, index) => (
            <span key={index} className="token-coin-rest">
              <Coin />
            </span>
          ))}
        </span>
      )}
    </article>
  );
}
