/**
 * PromptDetailModal: detail view of one saved prompt in a native modal <dialog> (focus trap,
 * Escape and the backdrop come from the browser). Shows the token breakdown, the impact, model
 * and timings, and a link back to the conversation. ← / → step through the loaded list.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { PromptRecordDto } from '../../dto/prompt-record.dto';
import {
  formatCo2,
  formatDateTime,
  formatDuration,
  formatEffort,
  formatEnergy,
  formatModel,
  formatProvider,
  formatWater,
  type Quantity,
} from '../format.helpers';
import { ImpactBadge, type ImpactKind } from './impact-badge.component';
import { ProviderIcon } from './provider-icon.component';
import { TokenBar } from './token-bar.component';
import { TokenCount } from './token-count.component';
import { TOKEN_CATEGORIES, type TokenCategory } from './token-category.helpers';

interface PromptDetailModalProps {
  /** `null` = closed. */
  record: PromptRecordDto | null;
  /** "3 of 128", shown next to the arrows. */
  position?: string;
  /** `undefined` at the start / end of the loaded list. */
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
}

/** Only real web pages: the URL comes from the chat page, so never link a `javascript:` URL. */
function conversationLink(url: string): { href: string; label: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return { href: parsed.href, label: `${parsed.host}${parsed.pathname}` };
  } catch {
    return null;
  }
}

function share(part: number, total: number): string {
  if (total <= 0 || part <= 0) return '0%';
  const percent = (part / total) * 100;
  return percent < 1 ? '<1%' : `${Math.round(percent)}%`;
}

function LegendGroup({
  title,
  categories,
  record,
}: {
  title: string;
  categories: readonly TokenCategory[];
  record: PromptRecordDto;
}) {
  return (
    <div className="prompt-detail-legend-group">
      <h3 className="prompt-detail-subheading">{title}</h3>
      <ul className="prompt-detail-legend">
        {categories.map(({ field, label, hidden }) => (
          <li key={field} className="prompt-detail-legend-row">
            <span
              className={`prompt-detail-swatch token-bar-segment--${field}${hidden ? ' token-bar-segment--hidden' : ''}`}
              aria-hidden="true"
            />
            <span className="prompt-detail-legend-label">{label}</span>
            <span className="prompt-detail-legend-value">
              <TokenCount value={record.breakdown[field]} unit={false} />
            </span>
            <span className="prompt-detail-legend-share">
              {share(record.breakdown[field], record.totalTokens)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImpactTile({ kind, quantity }: { kind: ImpactKind; quantity: Quantity }) {
  return (
    <div className={`prompt-detail-impact prompt-detail-impact--${kind}`}>
      <ImpactBadge kind={kind} />
      <span className="prompt-detail-impact-value">
        {quantity.value}
        <span className="prompt-detail-impact-unit"> {quantity.unit}</span>
      </span>
    </div>
  );
}

function Details({ record }: { record: PromptRecordDto }) {
  const effort = formatEffort(record.model.thinkingEffort);
  const rows: [string, string][] = [
    ['Chat app', formatProvider(record.provider)],
    ['Model', formatModel(record.model)],
    ['Thinking effort', effort ?? 'not shown'],
    ['Model label', record.model.rawLabel || '–'],
    ['Latency', formatDuration(record.timings.latencyMs)],
    ['Time to first text', formatDuration(record.timings.thinkingTimeMs)],
  ];
  return (
    <dl className="prompt-detail-facts">
      {rows.map(([term, value]) => (
        <div key={term} className="prompt-detail-fact">
          <dt className="prompt-detail-fact-term">{term}</dt>
          <dd className="prompt-detail-fact-value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PromptDetailModal({
  record,
  position,
  onPrevious,
  onNext,
  onClose,
}: PromptDetailModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // A text selection dragged out onto the backdrop must not close the dialog.
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (record && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!record && dialog.open) {
      dialog.close();
    }
  }, [record]);

  const onMouseDown = (event: MouseEvent<HTMLDialogElement>) => {
    pressedBackdrop.current = event.target === event.currentTarget;
  };
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (pressedBackdrop.current && event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'ArrowLeft' && onPrevious) onPrevious();
    if (event.key === 'ArrowRight' && onNext) onNext();
  };

  const link = record && conversationLink(record.conversationUrl);
  const visible = TOKEN_CATEGORIES.filter(({ hidden }) => !hidden);
  const hidden = TOKEN_CATEGORIES.filter(({ hidden }) => hidden);

  return (
    <dialog
      ref={dialogRef}
      className="prompt-detail"
      aria-labelledby="prompt-detail-title"
      onClose={onClose}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {record && (
        <div className="prompt-detail-body">
          <header className="prompt-detail-header">
            <div className="prompt-detail-heading">
              <h2 id="prompt-detail-title" className="prompt-detail-title">
                <ProviderIcon provider={record.provider} />
                {formatModel(record.model)}
              </h2>
              <p className="prompt-detail-date">{formatDateTime(record.capturedAt)}</p>
            </div>
            <div className="prompt-detail-nav">
              {position && <span className="prompt-detail-position">{position}</span>}
              <button
                type="button"
                className="prompt-detail-icon-button"
                onClick={onPrevious}
                disabled={!onPrevious}
                aria-label="Previous prompt"
                title="Previous prompt (←)"
              >
                <ChevronLeft />
              </button>
              <button
                type="button"
                className="prompt-detail-icon-button"
                onClick={onNext}
                disabled={!onNext}
                aria-label="Next prompt"
                title="Next prompt (→)"
              >
                <ChevronRight />
              </button>
              <button
                ref={closeRef}
                type="button"
                className="prompt-detail-icon-button"
                onClick={() => dialogRef.current?.close()}
                aria-label="Close"
                title="Close (Esc)"
              >
                <X />
              </button>
            </div>
          </header>

          <section className="prompt-detail-section" aria-label="Tokens">
            <p className="prompt-detail-total">
              <TokenCount value={record.totalTokens} size="hero" approximate={record.approximate} />
            </p>
            <TokenBar breakdown={record.breakdown} size="thick" />
            <div className="prompt-detail-legends">
              <LegendGroup title="Visible · counted" categories={visible} record={record} />
              <LegendGroup title="Hidden · estimated" categories={hidden} record={record} />
            </div>
          </section>

          <section className="prompt-detail-section" aria-label="Impact">
            <div className="prompt-detail-impacts">
              <ImpactTile kind="power" quantity={formatEnergy(record.impact.energyWh)} />
              <ImpactTile kind="water" quantity={formatWater(record.impact.waterMl)} />
              <ImpactTile kind="co2" quantity={formatCo2(record.impact.co2Grams)} />
            </div>
          </section>

          <section className="prompt-detail-section">
            <h3 className="prompt-detail-subheading">Model & timings</h3>
            <Details record={record} />
          </section>

          <footer className="prompt-detail-footer">
            {link ? (
              <a className="prompt-detail-link" href={link.href} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                Open conversation
                <span className="prompt-detail-link-url">{link.label}</span>
              </a>
            ) : (
              <span className="prompt-detail-no-link">No conversation link saved</span>
            )}
          </footer>
        </div>
      )}
    </dialog>
  );
}
