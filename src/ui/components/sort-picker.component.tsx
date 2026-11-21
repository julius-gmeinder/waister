/**
 * SortPicker: native select for the History order. A select, not chips, because it sits in the
 * same row as the provider chips and must not read as a third filter.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { ArrowDownUp } from 'lucide-react';
import type { HistorySort } from '../../dto/prompt-history.dto';
import { HISTORY_SORTS } from '../history.helpers';

interface SortPickerProps {
  value: HistorySort;
  onChange: (sort: HistorySort) => void;
}

export function SortPicker({ value, onChange }: SortPickerProps) {
  return (
    <label className="sort-picker">
      <ArrowDownUp aria-hidden="true" />
      <span className="sort-picker-label">Sort</span>
      <select
        className="sort-picker-select"
        value={value}
        onChange={(event) => onChange(event.target.value as HistorySort)}
      >
        {HISTORY_SORTS.map(({ id, label }) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
