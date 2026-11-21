/**
 * HistoryRow: one saved prompt as a clickable list row (time, chat app, model, total, TokenBar,
 * impact). Clicking it opens the PromptDetailModal.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { PromptRecordDto } from '../../dto/prompt-record.dto';
import {
  formatClock,
  formatCount,
  formatEffort,
  formatModel,
  formatProvider,
  formatShortDate,
} from '../format.helpers';
import { ImpactFigures } from './impact-figures.component';
import { TokenBar } from './token-bar.component';

interface HistoryRowProps {
  record: PromptRecordDto;
  /** In a ranking there is no day header, so the row shows its date itself. */
  showDate: boolean;
  onSelect: (record: PromptRecordDto) => void;
}

export function HistoryRow({ record, showDate, onSelect }: HistoryRowProps) {
  const effort = formatEffort(record.model.thinkingEffort);

  return (
    <li className="history-row-item">
      <button type="button" className="history-row" onClick={() => onSelect(record)}>
        <span className="history-row-time">
          {showDate && (
            <span className="history-row-date">{formatShortDate(record.capturedAt)}</span>
          )}
          <time dateTime={new Date(record.capturedAt).toISOString()}>
            {formatClock(record.capturedAt)}
          </time>
        </span>
        <span className="history-row-model">
          <span className="history-row-provider">{formatProvider(record.provider)}</span>
          <span className="history-row-model-name">{formatModel(record.model)}</span>
          {effort && <span className="history-row-effort">{effort}</span>}
        </span>
        <span className="history-row-tokens">
          {record.approximate && (
            <span className="history-row-approximate" title="Approximate estimate">
              ≈
            </span>
          )}
          {formatCount(record.totalTokens)}
          <span className="history-row-unit"> tokens</span>
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
