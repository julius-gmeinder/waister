/**
 * Facts helpers: smart-window benchmark filtering, cross-timeframe deduplicated shuffling (seeded
 * per `ui.facts.shuffleIntervalMinutes`), and human-friendly multiplier and raw KPI formatting
 * from `factSheet.json`.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { ui } from '../../../config/config.json';
import type { FactItem, FactKpiGroup, FactKpiId, FactTier } from '../../../config/config.types';
import factSheet from '../../../config/factSheet.json';
import type { FactsSummaries, SummaryState } from '../../usage-api';

export type FactsSectionId = 'daily' | 'weekly' | 'allTime';

export interface FactsSectionMeta {
  id: FactsSectionId;
  title: string;
}

export const FACTS_SECTIONS: readonly FactsSectionMeta[] = [
  { id: 'daily', title: 'Daily Perspective' },
  { id: 'weekly', title: 'Weekly Footprint' },
  { id: 'allTime', title: 'All-Time Cumulative' },
];

export const FACT_KPIS: readonly FactKpiId[] = ['power', 'water', 'co2'];

/** Preferred tiers when usage is zero, so each timeframe shows scale-appropriate benchmarks. */
const BASELINE_TIERS: Record<FactsSectionId, readonly FactTier[]> = {
  daily: ['micro', 'daily'],
  weekly: ['daily', 'weekly'],
  allTime: ['weekly', 'heavy'],
};

export interface SelectedFactComparison {
  kpi: FactKpiId;
  section: FactsSectionId;
  item: FactItem;
  userValue: number;
  ratio: number;
  isBaselineZero: boolean;
  /** Bold primary comparison readout, e.g. `~2.4×`, `45%`, or `0%`. */
  multiplierText: string;
  /** Plain phrase after the multiplier that leads into the fact, e.g. `as much energy as`. */
  comparisonQualifier: string;
  /** Formatted user KPI value with unit, e.g. `18.4 Wh`, `1.25 L`, `42 g CO₂e`. */
  formattedUserKpi: string;
  /** Formatted benchmark unit value, e.g. `15 Wh`, `250 mL`, `60 g CO₂e`. */
  formattedBenchmarkKpi: string;
}

export type FactsBoard = Record<FactsSectionId, Record<FactKpiId, SelectedFactComparison>>;

/** Extracts raw KPI values (`Wh`, `mL`, `g`) from a summary state, defaulting to 0 when empty. */
export function extractKpiValues(summary: SummaryState): Record<FactKpiId, number> {
  return {
    power: Math.max(0, summary?.impact.energyWh ?? 0),
    water: Math.max(0, summary?.impact.waterMl ?? 0),
    co2: Math.max(0, summary?.impact.co2Grams ?? 0),
  };
}

/** Formats a raw KPI number using `factSheet.kpis[kpi].displayUnits` (`Wh`/`kWh`, `mL`/`L`, `g CO₂e`/`kg CO₂e`). */
export function formatFactKpiValue(kpi: FactKpiId, rawValue: number): string {
  const group: FactKpiGroup = factSheet.kpis[kpi];
  const { small, large, largeThreshold } = group.displayUnits;
  const safe = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 0;

  if (safe === 0) return `0 ${small}`;

  const useLarge = safe >= largeThreshold;
  const scaled = useLarge ? safe / largeThreshold : safe;
  const unit = useLarge ? large : small;

  let formattedNum: string;
  if (scaled < 0.1) {
    formattedNum = scaled.toLocaleString('en-US', { maximumSignificantDigits: 2 });
  } else if (scaled < 10) {
    formattedNum = scaled.toLocaleString('en-US', { maximumFractionDigits: 2 });
  } else if (scaled < 100) {
    formattedNum = scaled.toLocaleString('en-US', { maximumFractionDigits: 1 });
  } else {
    formattedNum = Math.round(scaled).toLocaleString('en-US');
  }

  return `${formattedNum} ${unit}`;
}

/** What a KPI measures, in everyday words, for the comparison line. */
const KPI_NOUNS: Record<FactKpiId, string> = {
  power: 'energy',
  water: 'water',
  co2: 'CO₂',
};

/**
 * Formats the ratio (`userValue / item.value`) as an everyday comparison: the number, then a short
 * phrase that reads straight into the fact, e.g. "~2.4×" + "as much energy as" or "45%" + "of the
 * water for".
 */
export function formatFactMultiplier(
  kpi: FactKpiId,
  userValue: number,
  benchmarkValue: number,
): {
  multiplierText: string;
  comparisonQualifier: string;
  ratio: number;
  isBaselineZero: boolean;
} {
  const noun = KPI_NOUNS[kpi];
  const share = `of the ${noun} for`;
  const multiple = `as much ${noun} as`;

  if (!Number.isFinite(userValue) || userValue <= 0 || benchmarkValue <= 0) {
    return { multiplierText: '0%', comparisonQualifier: share, ratio: 0, isBaselineZero: true };
  }

  const ratio = userValue / benchmarkValue;
  const result = (multiplierText: string, comparisonQualifier: string) => ({
    multiplierText,
    comparisonQualifier,
    ratio,
    isBaselineZero: false,
  });

  if (ratio < 0.01) return result('<1%', share);
  if (ratio < 0.95) return result(`${Math.max(1, Math.round(ratio * 100))}%`, share);
  if (ratio <= 1.05) return result('About as much', `${noun} as`);
  if (ratio < 10) {
    const rounded = Math.round(ratio * 10) / 10;
    const text = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
    return result(`~${text}×`, multiple);
  }
  return result(`~${Math.round(ratio).toLocaleString()}×`, multiple);
}

/**
 * Returns candidate benchmarks for a given KPI and user value:
 * 1. Filters items where `userValue / item.value` falls within `meta.shuffleDefaults` (`0.25`..`15`).
 * 2. If `userValue === 0`, returns tier-appropriate baseline items for the timeframe section.
 * 3. If non-zero `userValue` falls outside all windows, returns the closest items by log distance.
 */
export function getCandidateFacts(
  kpi: FactKpiId,
  userValue: number,
  section: FactsSectionId,
): FactItem[] {
  const items = factSheet.kpis[kpi].items;
  const { minRatio, maxRatio } = factSheet.meta.shuffleDefaults;

  if (!Number.isFinite(userValue) || userValue <= 0) {
    const preferredTiers = BASELINE_TIERS[section] as readonly string[];
    const tierMatches = items.filter((item) => preferredTiers.includes(item.tier));
    return tierMatches.length > 0 ? tierMatches : items;
  }

  const inWindow = items.filter((item) => {
    const ratio = userValue / item.value;
    return ratio >= minRatio && ratio <= maxRatio;
  });

  if (inWindow.length > 0) {
    return inWindow;
  }

  // Fallback for very small or very large non-zero usage: pick the closest items by log ratio
  const sortedByCloseness = [...items].sort((a, b) => {
    const distA = Math.abs(Math.log(userValue / a.value));
    const distB = Math.abs(Math.log(userValue / b.value));
    return distA - distB;
  });

  // Return top 3 closest so re-shuffling still rotates alternatives
  return sortedByCloseness.slice(0, Math.min(3, sortedByCloseness.length));
}

/** Number of the shuffle interval `nowMs` falls into. Same number = same facts. */
export function factsShuffleSeed(nowMs: number): number {
  return Math.floor(nowMs / (ui.facts.shuffleIntervalMinutes * 60_000));
}

/**
 * Small deterministic PRNG (mulberry32): the same seed always yields the same sequence, so the
 * board only changes when the shuffle interval does.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pickRandom<T>(list: readonly T[], randomFn: () => number): T {
  const index = Math.floor(randomFn() * list.length);
  return list[Math.min(index, list.length - 1)]!;
}

/**
 * Picks one benchmark for a KPI value at random from `getCandidateFacts` and formats the
 * comparison. Facts in `avoid` are skipped while others fit. Also used by the Dashboard's
 * ImpactFacts.
 */
export function pickFactComparison(
  kpi: FactKpiId,
  userValue: number,
  section: FactsSectionId,
  randomFn: () => number = Math.random,
  avoid: ReadonlySet<string> = new Set(),
): SelectedFactComparison {
  const candidates = getCandidateFacts(kpi, userValue, section);
  const unused = candidates.filter((item) => !avoid.has(item.id));
  const chosen = pickRandom(unused.length > 0 ? unused : candidates, randomFn);
  const { multiplierText, comparisonQualifier, ratio, isBaselineZero } = formatFactMultiplier(
    kpi,
    userValue,
    chosen.value,
  );

  return {
    kpi,
    section,
    item: chosen,
    userValue,
    ratio,
    isBaselineZero,
    multiplierText,
    comparisonQualifier,
    formattedUserKpi: formatFactKpiValue(kpi, userValue),
    formattedBenchmarkKpi: formatFactKpiValue(kpi, chosen.value),
  };
}

/**
 * Selects one benchmark for each KPI across Daily, Weekly, and All-Time, avoiding the same fact
 * in two timeframes at once whenever alternative candidates exist.
 */
export function shuffleFactsBoard(
  summaries: FactsSummaries | undefined,
  randomFn: () => number = Math.random,
): FactsBoard {
  const sectionValues: Record<FactsSectionId, Record<FactKpiId, number>> = {
    daily: extractKpiValues(summaries?.daily),
    weekly: extractKpiValues(summaries?.weekly),
    allTime: extractKpiValues(summaries?.allTime),
  };

  const sections: readonly FactsSectionId[] = ['daily', 'weekly', 'allTime'];
  const board = {
    daily: {},
    weekly: {},
    allTime: {},
  } as FactsBoard;

  for (const kpi of FACT_KPIS) {
    const usedIdsInBoard = new Set<string>();

    for (const section of sections) {
      // Repeat a fact from another timeframe only when nothing else fits.
      const comparison = pickFactComparison(
        kpi,
        sectionValues[section][kpi],
        section,
        randomFn,
        usedIdsInBoard,
      );
      usedIdsInBoard.add(comparison.item.id);
      board[section][kpi] = comparison;
    }
  }

  return board;
}

/** Virtual water tooltip note from `factSheet.json`. */
export const VIRTUAL_WATER_TOOLTIP = factSheet.meta.assumptions.virtualWaterNote;
