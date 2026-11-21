/**
 * TimeframePicker: one chip per dashboard timeframe. The selected chip is yellow.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { TIMEFRAMES, type TimeframeId } from '../timeframe.helpers';
import { Chip } from './chip.component';
import { ChipGroup } from './chip-group.component';

interface TimeframePickerProps {
  value: TimeframeId;
  onChange: (id: TimeframeId) => void;
  /** Chip order, defaults to the order of TIMEFRAMES (shortest first). */
  order?: readonly TimeframeId[];
}

export function TimeframePicker({ value, onChange, order }: TimeframePickerProps) {
  const timeframes = order
    ? order.map((id) => TIMEFRAMES.find((timeframe) => timeframe.id === id)!)
    : TIMEFRAMES;
  return (
    <ChipGroup label="Timeframe">
      {timeframes.map(({ id, label }) => (
        <Chip key={id} pressed={id === value} onClick={() => onChange(id)}>
          {label}
        </Chip>
      ))}
    </ChipGroup>
  );
}
