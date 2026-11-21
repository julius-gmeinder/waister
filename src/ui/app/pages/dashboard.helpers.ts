/**
 * Dashboard helpers: turn a usage summary into animation speeds and the pool level
 * (formula in `DashboardConfig`, config.types.ts).
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { ui } from '../../../config/config.json';
import type { AnimationPeriodRange } from '../../../config/config.types';
import type { UsageSummaryDto } from '../../../dto/usage-summary.dto';
import { DAY_MS } from '../../timeframe.helpers';

const { dashboard: DASHBOARD } = ui;

export interface DashboardAnimation {
  /** `null` = no usage, the power card stands still. */
  pulseMs: number | null;
  /** `null` = no usage, no drops. */
  dripMs: number | null;
  /** 0..1 of the basin height. */
  poolFill: number;
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

function period(range: AnimationPeriodRange, level: number): number | null {
  if (level === 0) return null;
  return Math.round(range.slowest + (range.fastest - range.slowest) * level);
}

export function dashboardAnimation(
  summary: UsageSummaryDto | null | undefined,
): DashboardAnimation {
  if (!summary) return { pulseMs: null, dripMs: null, poolFill: DASHBOARD.poolFill.min };

  const days = activeDays(summary);
  const energy = intensity(summary.impact.energyWh, days, DASHBOARD.busyDay.energyWh);
  const water = intensity(summary.impact.waterMl, days, DASHBOARD.busyDay.waterMl);
  const { min, max } = DASHBOARD.poolFill;

  return {
    pulseMs: period(DASHBOARD.pulseMs, energy),
    dripMs: period(DASHBOARD.dripMs, water),
    poolFill: min + (max - min) * water,
  };
}
