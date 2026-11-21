/**
 * Dashboard helpers: turn a usage summary into animation speeds, the pond level and the cloud
 * count (formula in `DashboardConfig`, config.types.ts), and pick the cards' fun facts.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { ui } from '../../../config/config.json';
import type { AnimationPeriodRange, FactKpiId } from '../../../config/config.types';
import type { UsageSummaryDto } from '../../../dto/usage-summary.dto';
import { DAY_MS, type TimeframeId } from '../../timeframe.helpers';
import {
  extractKpiValues,
  pickFactComparison,
  type FactsSectionId,
  type SelectedFactComparison,
} from './facts.helpers';

const { dashboard: DASHBOARD } = ui;

export interface DashboardAnimation {
  /** `null` = no usage, the power card stands still. */
  pulseMs: number | null;
  /** `null` = no usage, no drops. */
  dripMs: number | null;
  /** Pond water size, a fraction of the banks. */
  pondFill: number;
  /** `null` = no usage, no smoke. */
  puffMs: number | null;
  /** Clouds in the smoke loop: enough to cover `cloudRiseMs`. */
  cloudCount: number;
}

/** Days the usage is spread over: oldest prompt in the window until the query, at least 1. */
function activeDays(summary: UsageSummaryDto): number {
  const start = summary.firstCapturedAt ?? summary.queriedAtMs;
  return Math.max(1, (summary.queriedAtMs - start) / DAY_MS);
}

/** 0..1. Usage per day relative to a busy day, curved so light days still move. */
function intensity(usage: number, days: number, busyDay: number): number {
  if (usage <= 0) return 0;
  return Math.min(1, usage / days / busyDay) ** DASHBOARD.intensityExponent;
}

function cloudCount(puffMs: number | null): number {
  if (puffMs === null) return 0;
  return Math.ceil(DASHBOARD.cloudRiseMs / puffMs);
}

function period(range: AnimationPeriodRange, level: number): number | null {
  if (level === 0) return null;
  return Math.round(range.slowest + (range.fastest - range.slowest) * level);
}

export function dashboardAnimation(
  summary: UsageSummaryDto | null | undefined,
): DashboardAnimation {
  if (!summary) {
    return {
      pulseMs: null,
      dripMs: null,
      pondFill: DASHBOARD.pondFill.min,
      puffMs: null,
      cloudCount: 0,
    };
  }

  const days = activeDays(summary);
  const energy = intensity(summary.impact.energyWh, days, DASHBOARD.busyDay.energyWh);
  const water = intensity(summary.impact.waterMl, days, DASHBOARD.busyDay.waterMl);
  const co2 = intensity(summary.impact.co2Grams, days, DASHBOARD.busyDay.co2Grams);
  const { min, max } = DASHBOARD.pondFill;
  const puffMs = period(DASHBOARD.puffMs, co2);

  return {
    pulseMs: period(DASHBOARD.pulseMs, energy),
    dripMs: period(DASHBOARD.dripMs, water),
    pondFill: min + (max - min) * water,
    puffMs,
    cloudCount: cloudCount(puffMs),
  };
}

/** Which Facts section's baseline benchmarks fit a timeframe (they only matter at zero usage). */
const FACT_SECTION: Record<TimeframeId, FactsSectionId> = {
  today: 'daily',
  week: 'weekly',
  month: 'allTime',
  all: 'allTime',
};

export type DashboardFacts = Record<FactKpiId, SelectedFactComparison>;

/**
 * One fun fact per card for the summary's usage, picked like the Facts page does. `null` while
 * loading, so no "0%" fact flashes before the numbers arrive.
 */
export function dashboardFacts(
  summary: UsageSummaryDto | null | undefined,
  timeframe: TimeframeId,
  randomFn: () => number,
): DashboardFacts | null {
  if (summary === undefined) return null;
  const values = extractKpiValues(summary);
  const section = FACT_SECTION[timeframe];
  return {
    power: pickFactComparison('power', values.power, section, randomFn),
    water: pickFactComparison('water', values.water, section, randomFn),
    co2: pickFactComparison('co2', values.co2, section, randomFn),
  };
}
