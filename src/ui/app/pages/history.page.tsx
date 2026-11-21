/**
 * HistoryPage: every saved prompt, filtered by timeframe and chat app, grouped by day (time
 * order) or ranked (metric order), with a detail modal per prompt. The App root owns the filter
 * and the fetched pages; this page only keeps which prompt is open.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { Clock } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PromptRecordDto } from '../../../dto/prompt-record.dto';
import { HistoryRow } from '../../components/history-row.component';
import { ImpactFigures } from '../../components/impact-figures.component';
import { PageTitle } from '../../components/page-title.component';
import { PromptDetailModal } from '../../components/prompt-detail-modal.component';
import { ProviderFilter } from '../../components/provider-filter.component';
import { SortPicker } from '../../components/sort-picker.component';
import { TimeframePicker } from '../../components/timeframe-picker.component';
import { formatCount, formatEnergy } from '../../format.helpers';
import {
  DEFAULT_HISTORY_VIEW,
  groupByDay,
  isChronological,
  type HistoryView,
} from '../../history.helpers';
import type { PromptHistoryState } from '../../usage-api';

interface HistoryPageProps {
  view: HistoryView;
  onViewChange: (view: HistoryView) => void;
  history: PromptHistoryState;
}

function plural(count: number, word: string): string {
  return `${formatCount(count)} ${word}${count === 1 ? '' : 's'}`;
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="history-empty">
      <Clock aria-hidden="true" />
      <p className="history-empty-title">No prompts here yet</p>
      <p className="history-empty-text">
        {filtered
          ? 'Try a longer timeframe or another chat app.'
          : 'Send a prompt in ChatGPT, Claude or Gemini and it shows up here.'}
      </p>
    </div>
  );
}

export function HistoryPage({ view, onViewChange, history }: HistoryPageProps) {
  const { records, summary, hasMore, loading, loadMore } = history;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => records ?? [], [records]);
  const chronological = isChronological(view.sort);
  const days = useMemo(
    () => (chronological ? groupByDay(list, summary?.queriedAtMs ?? Date.now()) : []),
    [chronological, list, summary?.queriedAtMs],
  );

  const index = selectedId ? list.findIndex((record) => record.id === selectedId) : -1;
  const selected = list[index] ?? null;
  // Only within the loaded rows: the arrows don't fetch the next page.
  const previous = index > 0 ? list[index - 1] : undefined;
  const next = index >= 0 ? list[index + 1] : undefined;
  const select = (record: PromptRecordDto) => setSelectedId(record.id);
  const filtered = view.timeframe !== DEFAULT_HISTORY_VIEW.timeframe || view.providers.length > 0;

  const renderRow = (record: PromptRecordDto) => (
    <HistoryRow key={record.id} record={record} showDate={!chronological} onSelect={select} />
  );

  let body;
  if (records === undefined) {
    body = <p className="page-placeholder">Loading prompts…</p>;
  } else if (records === null) {
    body = (
      <p className="page-placeholder">
        Couldn't reach the extension's background. Reload the extension and try again.
      </p>
    );
  } else if (list.length === 0) {
    body = <EmptyState filtered={filtered} />;
  } else if (chronological) {
    body = (
      <ol className="history-days">
        {days.map((day, dayIndex) => {
          // The last day may continue on the next page, so its totals are not final yet.
          const partial = hasMore && dayIndex === days.length - 1;
          const energy = formatEnergy(day.energyWh);
          return (
            <li key={day.startMs} className="history-day">
              <h2 className="history-day-header">
                <span className="history-day-label">{day.label}</span>
                <span className="history-day-total">
                  {plural(day.records.length, 'prompt')} · {formatCount(day.totalTokens)} tokens ·{' '}
                  {energy.value} {energy.unit}
                  {partial && ' so far'}
                </span>
              </h2>
              <ul className="history-list">{day.records.map(renderRow)}</ul>
            </li>
          );
        })}
      </ol>
    );
  } else {
    body = <ol className="history-list history-list--ranked">{list.map(renderRow)}</ol>;
  }

  return (
    <section className="history">
      <PageTitle>History</PageTitle>
      <TimeframePicker
        value={view.timeframe}
        onChange={(timeframe) => onViewChange({ ...view, timeframe })}
      />
      <div className="history-controls">
        <ProviderFilter
          value={view.providers}
          onChange={(providers) => onViewChange({ ...view, providers })}
        />
        <SortPicker value={view.sort} onChange={(sort) => onViewChange({ ...view, sort })} />
      </div>

      {summary && (
        <p className="history-summary">
          <span>
            <span className="history-summary-value">{plural(summary.promptCount, 'prompt')}</span>
            {' · '}
            <span className="history-summary-value">{formatCount(summary.totalTokens)}</span> tokens
          </span>
          <ImpactFigures impact={summary.impact} />
        </p>
      )}

      <div className={`history-results${loading && records ? ' history-results--loading' : ''}`}>
        {body}
      </div>

      {hasMore && (
        <button type="button" className="history-more" onClick={loadMore} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
          <span className="history-more-count">
            {formatCount(list.length)} of {formatCount(summary?.promptCount)}
          </span>
        </button>
      )}

      <PromptDetailModal
        record={selected}
        position={selected ? `${index + 1} of ${formatCount(summary?.promptCount)}` : undefined}
        onPrevious={previous && (() => select(previous))}
        onNext={next && (() => select(next))}
        onClose={() => setSelectedId(null)}
      />
    </section>
  );
}
