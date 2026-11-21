/**
 * Format helpers: pure display formatting shared by the popup and app page components.
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

const LOADING = '–';

/** Locale-formatted count, or an en dash while the value is still loading. */
export function formatCount(n?: number): string {
  return n?.toLocaleString() ?? LOADING;
}

/** A measured value split into number and unit, so they can be styled separately. */
export interface Quantity {
  value: string;
  unit: string;
}

/** Fewer decimals as the number grows. Below 1, 2 significant digits keep tiny values readable. */
function formatMeasure(n: number): string {
  if (n === 0) return '0';
  if (n < 1) return n.toLocaleString(undefined, { maximumSignificantDigits: 2 });
  const decimals = n < 10 ? 2 : n < 100 ? 1 : 0;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/** Switches to the 1000× unit from 1000 on (Wh → kWh, mL → L). */
function formatScaled(n: number | undefined, unit: string, bigUnit: string): Quantity {
  if (n === undefined) return { value: LOADING, unit };
  if (n >= 1000) return { value: formatMeasure(n / 1000), unit: bigUnit };
  return { value: formatMeasure(n), unit };
}

export function formatEnergy(wh?: number): Quantity {
  return formatScaled(wh, 'Wh', 'kWh');
}

export function formatWater(ml?: number): Quantity {
  return formatScaled(ml, 'mL', 'L');
}

/** Locale-formatted float metric (Wh, mL), or an en dash while the value is still loading. */
export function formatMetric(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return '–';
  if (n === 0) return '0';
  const maximumFractionDigits = n < 0.01 ? 4 : n < 10 ? 2 : 1;
  return n.toLocaleString(undefined, { maximumFractionDigits });
}
