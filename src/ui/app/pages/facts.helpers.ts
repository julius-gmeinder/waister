/**
 * Facts helpers: smart-window benchmark filtering, cross-timeframe deduplicated shuffling, and
 * human-friendly multiplier and raw KPI formatting from `factSheet.json`.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { FactItem, FactKpiGroup, FactKpiId, FactTier } from '../../../config/config.types';
import factSheet from '../../../config/factSheet.json';
import type { FactsSummaries, SummaryState } from '../../usage-api';

export type FactsSectionId = 'daily' | 'weekly' | 'allTime';

export interface FactsSectionMeta {
  id: FactsSectionId;
  title: string;
  subtitle: string;
  badge: string;
}

export const FACTS_SECTIONS: readonly FactsSectionMeta[] = [
  {
    id: 'daily',
    title: 'Daily Perspective',
    subtitle: "Today's AI footprint translated into tangible everyday moments",
    badge: 'Today',
  },
  {
    id: 'weekly',
    title: 'Weekly Footprint',
    subtitle: 'Rolling 7-day consumption stacked against household routines',
    badge: 'Last 7 days',
  },
  {
    id: 'allTime',
    title: 'All-Time Cumulative',
    subtitle: 'Your total recorded AI energy, water and carbon impact',
    badge: 'Cumulative',
  },
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
  kpiLabel: string;
  section: FactsSectionId;
  item: FactItem;
  userValue: number;
  ratio: number;
  isBaselineZero: boolean;
  /** Bold primary comparison readout, e.g. `~2.4×`, `45% of`, or `1×`. */
  multiplierText: string;
  /** Context label next to the multiplier, e.g. `equivalent` or `baseline benchmark`. */
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

/** Formats the ratio (`userValue / item.value`) into a natural everyday comparison string. */
export function formatFactMultiplier(
  userValue: number,
  benchmarkValue: number,
): {
  multiplierText: string;
  comparisonQualifier: string;
  ratio: number;
  isBaselineZero: boolean;
} {
  if (!Number.isFinite(userValue) || userValue <= 0 || benchmarkValue <= 0) {
    return {
      multiplierText: '1×',
      comparisonQualifier: 'baseline benchmark',
      ratio: 0,
      isBaselineZero: true,
    };
  }

  const ratio = userValue / benchmarkValue;

  if (ratio < 0.01) {
    return {
      multiplierText: '<1% of',
      comparisonQualifier: 'this benchmark',
      ratio,
      isBaselineZero: false,
    };
  }

  if (ratio < 0.95) {
    const pct = Math.max(1, Math.round(ratio * 100));
    return {
      multiplierText: `${pct}% of`,
      comparisonQualifier: 'this benchmark',
      ratio,
      isBaselineZero: false,
    };
  }

  if (ratio <= 1.05) {
    return {
      multiplierText: '~1×',
      comparisonQualifier: 'equivalent impact',
      ratio,
      isBaselineZero: false,
    };
  }

  if (ratio < 10) {
    const rounded = Math.round(ratio * 10) / 10;
    const text = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
    return {
      multiplierText: `~${text}×`,
      comparisonQualifier: 'equivalent impact',
      ratio,
      isBaselineZero: false,
    };
  }

  const roundedInt = Math.round(ratio);
  return {
    multiplierText: `~${roundedInt.toLocaleString()}×`,
    comparisonQualifier: 'equivalent impact',
    ratio,
    isBaselineZero: false,
  };
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

function pickRandom<T>(list: readonly T[], randomFn: () => number): T {
  const index = Math.floor(randomFn() * list.length);
  return list[Math.min(index, list.length - 1)]!;
}

/**
 * Selects one benchmark for each KPI across Daily, Weekly, and All-Time:
 * - Avoids picking the same fact across Daily, Weekly, and All-Time simultaneously.
 * - Avoids repeating the currently displayed fact (`previousBoard`) on manual Shuffle clicks
 *   whenever alternative candidates exist.
 */
export function shuffleFactsBoard(
  summaries: FactsSummaries | undefined,
  previousBoard?: FactsBoard | null,
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
    const kpiGroup = factSheet.kpis[kpi];

    for (const section of sections) {
      const userValue = sectionValues[section][kpi];
      const candidates = getCandidateFacts(kpi, userValue, section);
      const previousId = previousBoard?.[section]?.[kpi]?.item.id;

      // Prefer candidates neither used in another timeframe nor shown in this slot before shuffle
      let pool = candidates.filter(
        (item) => !usedIdsInBoard.has(item.id) && item.id !== previousId,
      );

      // Next best: not used in another timeframe simultaneously
      if (pool.length === 0) {
        pool = candidates.filter((item) => !usedIdsInBoard.has(item.id));
      }

      // Next best: differs from the previous card in this slot
      if (pool.length === 0) {
        pool = candidates.filter((item) => item.id !== previousId);
      }

      // Final fallback if only 1 candidate exists
      if (pool.length === 0) {
        pool = candidates;
      }

      const chosen = pickRandom(pool, randomFn);
      usedIdsInBoard.add(chosen.id);

      const { multiplierText, comparisonQualifier, ratio, isBaselineZero } = formatFactMultiplier(
        userValue,
        chosen.value,
      );

      board[section][kpi] = {
        kpi,
        kpiLabel: kpiGroup.label,
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
  }

  return board;
}

/** Virtual water tooltip note from `factSheet.json`. */
export const VIRTUAL_WATER_TOOLTIP = factSheet.meta.assumptions.virtualWaterNote;
