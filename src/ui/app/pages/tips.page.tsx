/**
 * TipsPage: curated, jargon-free AI habits page with personalized recommendations from recent
 * usage, category filtering, progressive-disclosure before/after examples, and persisted habit
 * adoption tracking.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { CheckCircle2, Lightbulb } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PromptRecordDto } from '../../../dto/prompt-record.dto';
import { CategoryFilterBar } from '../../components/category-filter-bar.component';
import { FeaturedTipCard } from '../../components/featured-tip-card.component';
import { PageTitle } from '../../components/page-title.component';
import { TipCard } from '../../components/tip-card.component';
import type { PromptRecordsState } from '../../usage-api';
import { TIPS_CATALOG, type TipFilterId, type TipId } from './tips-catalog.helpers';
import { readAdoptedTipIds, recommendTips, writeAdoptedTipIds } from './tips-recommender.helpers';

interface TipsPageProps {
  records?: PromptRecordsState;
}

export function TipsPage({ records }: TipsPageProps) {
  const [selectedCategory, setSelectedCategory] = useState<TipFilterId>('all');
  const [hideAdopted, setHideAdopted] = useState(false);
  const [adoptedTipIds, setAdoptedTipIds] = useState<TipId[]>(readAdoptedTipIds);
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    writeAdoptedTipIds(adoptedTipIds);
  }, [adoptedTipIds]);

  const adoptedSet = useMemo(() => new Set<TipId>(adoptedTipIds), [adoptedTipIds]);
  const safeRecords: readonly PromptRecordDto[] = useMemo(() => records ?? [], [records]);
  const nowMs = useMemo(() => Date.now(), [records]);

  const recommendation = useMemo(
    () => recommendTips(safeRecords, adoptedTipIds, nowMs),
    [safeRecords, adoptedTipIds, nowMs],
  );

  const visibleTips = useMemo(
    () =>
      TIPS_CATALOG.filter((tip) => {
        if (selectedCategory !== 'all' && tip.category !== selectedCategory) return false;
        if (hideAdopted && adoptedSet.has(tip.id)) return false;
        return true;
      }),
    [selectedCategory, hideAdopted, adoptedSet],
  );

  const toggleAdopt = useCallback((id: TipId) => {
    setAdoptedTipIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const adoptedCount = adoptedTipIds.length;
  const totalCount = TIPS_CATALOG.length;
  const featuredCount = recommendation.items.length;

  return (
    <section className="tips-page">
      <header className="tips-header">
        <div className="tips-header-copy">
          <PageTitle>Tips</PageTitle>
          <p className="tips-subtitle">
            Small habits that save energy without sacrificing answer quality.
          </p>
        </div>

        <div className="tips-progress-pill" role="status" aria-live="polite">
          <CheckCircle2 aria-hidden="true" />
          <span>
            <strong className="tips-progress-count">{adoptedCount}</strong> of {totalCount} habits
            adopted
          </span>
        </div>
      </header>

      {/* Section 1: Personalized Hero Strip (1–2 Cards Max) */}
      <section className="tips-section" aria-labelledby="tips-recommended-heading">
        <div className="tips-section-header">
          <h2 id="tips-recommended-heading" className="tips-section-title">
            {recommendation.sectionTitle}
          </h2>
          {recommendation.isStarterFallback && (
            <p className="tips-section-meta">
              Send a few AI messages to unlock habits tailored to your usage.
            </p>
          )}
        </div>

        <div
          className={
            featuredCount === 1
              ? 'tips-featured-grid tips-featured-grid--single'
              : 'tips-featured-grid'
          }
        >
          {recommendation.items.map((item, index) => {
            const key = `featured:${item.tip.id}`;
            return (
              <FeaturedTipCard
                key={item.tip.id}
                tip={item.tip}
                reason={item.reason}
                expanded={expandedKeys.has(key)}
                adopted={adoptedSet.has(item.tip.id)}
                onToggleExpand={() => toggleExpand(key)}
                onToggleAdopt={toggleAdopt}
                enterIndex={index}
              />
            );
          })}
        </div>
      </section>

      {/* Section 2: Filter Bar + Scannable 2-Column Tip Grid */}
      <section className="tips-section" aria-labelledby="tips-all-heading">
        <div className="tips-section-header">
          <h2 id="tips-all-heading" className="tips-section-title">
            All habits
          </h2>
          <p className="tips-section-meta">
            {visibleTips.length} of {totalCount} shown
          </p>
        </div>

        <CategoryFilterBar
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          hideAdopted={hideAdopted}
          onHideAdoptedChange={setHideAdopted}
        />

        {visibleTips.length === 0 ? (
          <div className="tips-empty">
            <Lightbulb aria-hidden="true" />
            <p className="tips-empty-title">All habits in this view are adopted</p>
            <p className="tips-empty-text">
              Nice work—turn off &ldquo;Hide adopted&rdquo; or pick another category to review them.
            </p>
            <button
              type="button"
              className="tips-empty-action"
              onClick={() => setHideAdopted(false)}
            >
              Show adopted habits
            </button>
          </div>
        ) : (
          <div className="tips-grid">
            {visibleTips.map((tip, index) => {
              const key = `grid:${tip.id}`;
              return (
                <TipCard
                  key={tip.id}
                  tip={tip}
                  expanded={expandedKeys.has(key)}
                  adopted={adoptedSet.has(tip.id)}
                  onToggleExpand={() => toggleExpand(key)}
                  onToggleAdopt={toggleAdopt}
                  enterIndex={featuredCount + index}
                />
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
