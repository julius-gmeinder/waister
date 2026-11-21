/**
 * InfoTooltip: subtle `ⓘ` methodology icon that reveals a 1–2 sentence explanation popover on
 * hover, keyboard focus, or click.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { Info } from 'lucide-react';
import { useId, useState } from 'react';

interface InfoTooltipProps {
  text: string;
  label?: string;
}

export function InfoTooltip({ text, label = 'Methodology details' }: InfoTooltipProps) {
  const [pinned, setPinned] = useState(false);
  const tooltipId = useId();

  return (
    <span className="info-tooltip">
      <button
        type="button"
        className="info-tooltip-trigger"
        aria-label={label}
        aria-expanded={pinned}
        aria-describedby={tooltipId}
        onClick={() => setPinned((prev) => !prev)}
        onBlur={() => setPinned(false)}
      >
        <Info />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={
          pinned ? 'info-tooltip-popover info-tooltip-popover--pinned' : 'info-tooltip-popover'
        }
      >
        {text}
      </span>
    </span>
  );
}
