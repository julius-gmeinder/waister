/**
 * FactsPage: everyday perspective benchmarks across Daily, Weekly, and All-Time usage, one row of
 * equal-height cards per section. The pick is seeded per shuffle interval (`ui.facts`), so the
 * facts change at most once per interval instead of on every visit.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { useMemo, useState } from 'react';
import { FactCard, type FactCardVariant } from '../../components/fact-card.component';
import { PageTitle } from '../../components/page-title.component';
import { TokenCount } from '../../components/token-count.component';
import { formatCount } from '../../format.helpers';
import type { FactsSummaries, SummaryState } from '../../usage-api';
import {
  FACT_KPIS,
  FACTS_SECTIONS,
  factsShuffleSeed,
  seededRandom,
  shuffleFactsBoard,
  type FactsSectionId,
} from './facts.helpers';

interface FactsPageProps {
  summaries?: FactsSummaries;
}

/** Which card of a section is wide. Must match the column widths of `.facts-grid--<section>` (app.css). */
const SECTION_VARIANTS: Record<
  FactsSectionId,
  readonly [FactCardVariant, FactCardVariant, FactCardVariant]
> = {
  daily: ['wide', 'regular', 'regular'],
  weekly: ['regular', 'regular', 'regular'],
  allTime: ['regular', 'regular', 'wide'],
};

function describeSectionUsage(summary: SummaryState) {
  if (summary === undefined) return 'Loading…';
  if (summary === null || summary.promptCount === 0) return 'No prompts yet';
  const prompts = summary.promptCount;
  return (
    <>
      <TokenCount value={summary.totalTokens} /> · {formatCount(prompts)}{' '}
      {prompts === 1 ? 'prompt' : 'prompts'}
    </>
  );
}

export function FactsPage({ summaries }: FactsPageProps) {
  // Fixed while the page is open, so the cards don't swap under the reader at the interval edge.
  const [seed] = useState(() => factsShuffleSeed(Date.now()));
  // A fresh PRNG per render with the same seed: async summaries refine the pick, not reshuffle it.
  const board = useMemo(() => shuffleFactsBoard(summaries, seededRandom(seed)), [summaries, seed]);

  return (
    <section className="facts-page">
      <header className="facts-header">
        <PageTitle>Everyday Perspective</PageTitle>
        <p className="facts-subtitle">
          Your AI energy, water, and carbon footprint compared against familiar real-world
          benchmarks.
        </p>
      </header>

      <div className="facts-sections">
        {FACTS_SECTIONS.map((section, sectionIndex) => {
          const variants = SECTION_VARIANTS[section.id];

          return (
            <section
              key={section.id}
              className={`facts-section facts-section--${section.id}`}
              aria-labelledby={`facts-heading-${section.id}`}
            >
              <div className="facts-section-header">
                <h2 id={`facts-heading-${section.id}`} className="facts-section-title">
                  {section.title}
                </h2>
                <p className="facts-section-meta">
                  {describeSectionUsage(summaries?.[section.id])}
                </p>
              </div>

              <div className={`facts-grid facts-grid--${section.id}`}>
                {FACT_KPIS.map((kpi, kpiIndex) => (
                  <FactCard
                    key={`${section.id}-${kpi}`}
                    comparison={board[section.id][kpi]}
                    variant={variants[kpiIndex]!}
                    enterIndex={sectionIndex * 3 + kpiIndex}
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
