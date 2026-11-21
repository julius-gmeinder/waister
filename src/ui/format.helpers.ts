/**
 * Format helpers: pure display formatting shared by the popup and app page components.
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

import type { ModelInfo, Provider, ThinkingEffort } from '../dto/chat-capture.dto';

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

/** Switches to the 1000× unit from 1000 on (Wh → kWh, mL → L, g → kg). */
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

export function formatCo2(grams?: number): Quantity {
  return formatScaled(grams, 'g', 'kg');
}

/** Locale-formatted float metric (Wh, mL), or an en dash while the value is still loading. */
export function formatMetric(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return '–';
  if (n === 0) return '0';
  const maximumFractionDigits = n < 0.01 ? 4 : n < 10 ? 2 : 1;
  return n.toLocaleString(undefined, { maximumFractionDigits });
}

/** The chat app's name, which is what users recognize, not the company behind it. */
const PROVIDER_LABELS: Record<Provider, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  google: 'Gemini',
};

export function formatProvider(provider: Provider): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/**
 * "Sonnet 4.5", "Pro 2.5", "GPT 5". The provider is shown next to it, so its prefix in the family
 * name (`claude-sonnet`, `gemini-pro`) is dropped.
 */
export function formatModel(model: ModelInfo): string {
  const family = model.name.replace(/^(claude|gemini)-/, '');
  const name = family === 'gpt' ? 'GPT' : family.charAt(0).toUpperCase() + family.slice(1);
  return model.version && model.version !== 'unknown' ? `${name} ${model.version}` : name;
}

/** Shown as a tag next to the model. `null` when the site's UI didn't show an effort. */
export function formatEffort(effort: ThinkingEffort): string | null {
  switch (effort) {
    case 'unknown':
      return null;
    case 'none':
      return 'no thinking';
    case 'xhigh':
      return 'extra high';
    default:
      return effort;
  }
}

/** "820 ms", "12.4 s", "2 min 05 s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toLocaleString(undefined, { maximumFractionDigits: 1 })} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(Math.round(seconds % 60)).padStart(2, '0')} s`;
}

/** Local wall-clock time, "14:32". */
export function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** "21 Nov", plus the year if it isn't the current one. */
export function formatShortDate(epochMs: number): string {
  const date = new Date(epochMs);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Full local date and time, for the detail view. */
export function formatDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
