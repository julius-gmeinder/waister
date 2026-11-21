/**
 * Dashboard helpers: turn a usage summary into animation speeds, the pool level and the cloud
 * count (formula in `DashboardConfig`, config.types.ts).
 *
 * Context: popup, app page
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
  /** `null` = no usage, no smoke. */
  puffMs: number | null;
  /** Clouds in the smoke loop: enough to cover `cloudRiseMs`, even so both chimneys alternate. */
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
  return 2 * Math.ceil(DASHBOARD.cloudRiseMs / (2 * puffMs));
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
      poolFill: DASHBOARD.poolFill.min,
      puffMs: null,
      cloudCount: 0,
    };
  }

  const days = activeDays(summary);
  const energy = intensity(summary.impact.energyWh, days, DASHBOARD.busyDay.energyWh);
  const water = intensity(summary.impact.waterMl, days, DASHBOARD.busyDay.waterMl);
  const co2 = intensity(summary.impact.co2Grams, days, DASHBOARD.busyDay.co2Grams);
  const { min, max } = DASHBOARD.poolFill;
  const puffMs = period(DASHBOARD.puffMs, co2);

  return {
    pulseMs: period(DASHBOARD.pulseMs, energy),
    dripMs: period(DASHBOARD.dripMs, water),
    poolFill: min + (max - min) * water,
    puffMs,
    cloudCount: cloudCount(puffMs),
  };
}
