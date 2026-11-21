/**
 * Format helpers: pure display formatting shared by the popup and app page components.
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

/** Locale-formatted count, or an en dash while the value is still loading. */
export function formatCount(n?: number): string {
  return n?.toLocaleString() ?? '–';
}

/** Locale-formatted float metric (Wh, mL), or an en dash while the value is still loading. */
export function formatMetric(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return '–';
  if (n === 0) return '0';
  const maximumFractionDigits = n < 0.01 ? 4 : n < 10 ? 2 : 1;
  return n.toLocaleString(undefined, { maximumFractionDigits });
}
