/**
 * TimeframePicker: one chip per dashboard timeframe. The selected chip is yellow.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { TIMEFRAMES, type TimeframeId } from '../timeframe.helpers';

interface TimeframePickerProps {
  value: TimeframeId;
  onChange: (id: TimeframeId) => void;
}

export function TimeframePicker({ value, onChange }: TimeframePickerProps) {
  return (
    <div className="timeframe-picker" role="group" aria-label="Timeframe">
      {TIMEFRAMES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="timeframe-picker-chip"
          aria-pressed={id === value}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
