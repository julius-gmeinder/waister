/**
 * HistoryRow: one saved prompt as a clickable list row (time, chat app icon, model, impact,
 * total, then a full-width TokenBar). Clicking it opens the PromptDetailModal.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { CSSProperties } from 'react';
import type { PromptRecordDto } from '../../dto/prompt-record.dto';
import { formatClock, formatEffort, formatModel, formatShortDate } from '../format.helpers';
import { ImpactFigures } from './impact-figures.component';
import { ProviderIcon } from './provider-icon.component';
import { TokenBar } from './token-bar.component';
import { TokenCount } from './token-count.component';

interface HistoryRowProps {
  record: PromptRecordDto;
  /** In a ranking there is no day header, so the row shows its date itself. */
  showDate: boolean;
  onSelect: (record: PromptRecordDto) => void;
  /** Position in the page-open stagger (`--enter-index`, components.css). */
  enterIndex: number;
}

export function HistoryRow({ record, showDate, onSelect, enterIndex }: HistoryRowProps) {
  const effort = formatEffort(record.model.thinkingEffort);

  return (
    <li className="history-row-item">
      <button
        type="button"
        className="history-row"
        style={{ '--enter-index': enterIndex } as CSSProperties}
        onClick={() => onSelect(record)}
      >
        <span className="history-row-time">
          {showDate && (
            <span className="history-row-date">{formatShortDate(record.capturedAt)}</span>
          )}
          <time dateTime={new Date(record.capturedAt).toISOString()}>
            {formatClock(record.capturedAt)}
          </time>
        </span>
        <span className="history-row-model">
          <ProviderIcon provider={record.provider} />
          <span className="history-row-model-name">{formatModel(record.model)}</span>
          {effort && <span className="history-row-effort">{effort}</span>}
        </span>
        <span className="history-row-tokens">
          <TokenCount value={record.totalTokens} approximate={record.approximate} />
        </span>
        <span className="history-row-bar">
          <TokenBar breakdown={record.breakdown} />
        </span>
        <span className="history-row-impact">
          <ImpactFigures impact={record.impact} />
        </span>
      </button>
    </li>
  );
}
