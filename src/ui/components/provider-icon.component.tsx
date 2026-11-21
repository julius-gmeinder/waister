/**
 * ProviderIcon: a small inline SVG mark per chat app (ChatGPT, Claude, Gemini), drawn as simple
 * look-alikes of their logos. Inline, not files in public/, so colors come from CSS variables.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { useId, type ComponentType } from 'react';
import type { Provider } from '../../dto/chat-capture.dto';
import { formatProvider } from '../format.helpers';

interface ProviderIconProps {
  provider: Provider;
}

/** Claude's sunburst: 12 rays of uneven length, like the logo's hand-cut look. */
const CLAUDE_RAYS = [10, 8.2, 9.4, 7.8, 10, 8.6, 9.2, 7.6, 10, 8.4, 9.6, 8];

function ClaudeMark() {
  return (
    <g className="provider-icon-claude" strokeLinecap="round" strokeWidth={2.2}>
      {CLAUDE_RAYS.map((length, index) => {
        const angle = (index / CLAUDE_RAYS.length) * 2 * Math.PI;
        const x = 12 + length * Math.cos(angle);
        const y = 12 + length * Math.sin(angle);
        return <line key={index} x1={12} y1={12} x2={x.toFixed(2)} y2={y.toFixed(2)} />;
      })}
    </g>
  );
}

/** ChatGPT's knot: six capsules turned by 60°, shifted off-center so they swirl. */
function OpenAiMark() {
  return (
    <g className="provider-icon-openai" fill="none" strokeWidth={1.5}>
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <rect
          key={angle}
          x={11.2}
          y={3.4}
          width={5.4}
          height={9.6}
          rx={2.7}
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
    </g>
  );
}

/** Gemini's four-point sparkle with concave sides, in its blue-to-violet gradient. */
function GeminiMark() {
  // Several icons share one page, so each gradient needs its own id. useId's colons are dropped
  // to keep the url(#…) reference plain.
  const gradientId = `gemini-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" className="provider-icon-gemini-start" />
          <stop offset="1" className="provider-icon-gemini-end" />
        </linearGradient>
      </defs>
      <path
        d="M12 1.5C12 7.3 16.7 12 22.5 12C16.7 12 12 16.7 12 22.5C12 16.7 7.3 12 1.5 12C7.3 12 12 7.3 12 1.5Z"
        fill={`url(#${gradientId})`}
      />
    </>
  );
}

const MARKS: Record<Provider, ComponentType> = {
  openai: OpenAiMark,
  anthropic: ClaudeMark,
  google: GeminiMark,
};

export function ProviderIcon({ provider }: ProviderIconProps) {
  const Mark = MARKS[provider];
  const label = formatProvider(provider);
  return (
    <svg
      className={`provider-icon provider-icon--${provider}`}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <Mark />
    </svg>
  );
}
