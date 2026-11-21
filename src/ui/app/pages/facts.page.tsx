/**
 * FactsPage: everyday perspective benchmarks across Daily, Weekly, and All-Time usage in an
 * organic glassmorphic bento layout. Auto-shuffles on every mount and re-shuffles with smooth
 * staggered transitions when the Shuffle button is clicked.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { Dices, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { FactCard, type FactCardVariant } from '../../components/fact-card.component';
import { PageTitle } from '../../components/page-title.component';
import { formatCount } from '../../format.helpers';
import type { FactsSummaries, SummaryState } from '../../usage-api';
import {
  FACT_KPIS,
  FACTS_SECTIONS,
  shuffleFactsBoard,
  type FactsBoard,
  type FactsSectionId,
} from './facts.helpers';

interface FactsPageProps {
  summaries?: FactsSummaries;
}

/** Distinct asymmetric card variants per timeframe section so no two sections share a uniform grid. */
const SECTION_VARIANTS: Record<
  FactsSectionId,
  readonly [FactCardVariant, FactCardVariant, FactCardVariant]
> = {
  daily: ['hero', 'compact', 'compact'],
  weekly: ['stagger', 'stagger', 'stagger'],
  allTime: ['ribbon', 'compact', 'compact'],
};

function describeSectionUsage(summary: SummaryState): string {
  if (summary === undefined) return 'Loading usage…';
  if (summary === null || summary.promptCount === 0) {
    return '0 prompts captured · Showing everyday baseline benchmarks';
  }
  const prompts = summary.promptCount;
  return `${formatCount(summary.totalTokens)} tokens across ${formatCount(prompts)} ${
    prompts === 1 ? 'prompt' : 'prompts'
  }`;
}

export function FactsPage({ summaries }: FactsPageProps) {
  // Auto-shuffle on mount so opening the Facts Page always yields a fresh perspective.
  const [board, setBoard] = useState<FactsBoard>(() => shuffleFactsBoard(summaries));
  const [shuffleGeneration, setShuffleGeneration] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);

  // Re-compute comparisons when async database summaries arrive from the background service worker.
  useEffect(() => {
    setBoard((prev) => shuffleFactsBoard(summaries, prev));
  }, [summaries]);

  const handleShuffle = useCallback(() => {
    setBoard((prev) => shuffleFactsBoard(summaries, prev));
    setShuffleGeneration((gen) => gen + 1);
    setIsSpinning(true);
  }, [summaries]);

  useEffect(() => {
    if (!isSpinning) return;
    const timer = window.setTimeout(() => setIsSpinning(false), 480);
    return () => window.clearTimeout(timer);
  }, [isSpinning]);

  return (
    <section className="facts-page">
      <div className="facts-ambient" aria-hidden="true">
        <span className="facts-orb facts-orb--power" />
        <span className="facts-orb facts-orb--water" />
        <span className="facts-orb facts-orb--co2" />
      </div>

      <header className="facts-header">
        <div className="facts-header-copy">
          <PageTitle>Everyday Perspective</PageTitle>
          <p className="facts-subtitle">
            Your AI energy, water, and carbon footprint compared against familiar real-world
            benchmarks.
          </p>
        </div>

        <button
          type="button"
          className={
            isSpinning ? 'facts-shuffle-btn facts-shuffle-btn--spinning' : 'facts-shuffle-btn'
          }
          onClick={handleShuffle}
          aria-label="Shuffle perspective facts across all timeframes"
        >
          <Dices className="facts-shuffle-dice" />
          <span>Shuffle Facts</span>
          <RefreshCw className="facts-shuffle-refresh" />
        </button>
      </header>

      <div className="facts-sections">
        {FACTS_SECTIONS.map((section, sectionIndex) => {
          const sectionSummary = summaries?.[section.id];
          const variants = SECTION_VARIANTS[section.id];

          return (
            <section
              key={section.id}
              className={`facts-section facts-section--${section.id}`}
              aria-labelledby={`facts-heading-${section.id}`}
            >
              <div className="facts-section-header">
                <div className="facts-section-title-row">
                  <span className="facts-section-badge">{section.badge}</span>
                  <h2 id={`facts-heading-${section.id}`} className="facts-section-title">
                    {section.title}
                  </h2>
                </div>
                <p className="facts-section-meta">
                  {section.subtitle} ·{' '}
                  <span className="facts-section-usage">
                    {describeSectionUsage(sectionSummary)}
                  </span>
                </p>
              </div>

              <div className={`facts-grid facts-grid--${section.id}`}>
                {FACT_KPIS.map((kpi, kpiIndex) => (
                  <FactCard
                    key={`${section.id}-${kpi}`}
                    comparison={board[section.id][kpi]}
                    variant={variants[kpiIndex]!}
                    staggerIndex={sectionIndex * 3 + kpiIndex}
                    shuffleGeneration={shuffleGeneration}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
