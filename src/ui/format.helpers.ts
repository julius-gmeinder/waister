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
