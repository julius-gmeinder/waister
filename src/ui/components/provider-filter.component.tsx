/**
 * ProviderFilter: an "All" chip plus one toggle chip per chat app. Several can be on at once;
 * none on means all.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { Provider } from '../../dto/chat-capture.dto';
import { formatProvider } from '../format.helpers';
import { HISTORY_PROVIDERS, toggleProvider } from '../history.helpers';

interface ProviderFilterProps {
  /** Empty = all providers. */
  value: Provider[];
  onChange: (providers: Provider[]) => void;
}

export function ProviderFilter({ value, onChange }: ProviderFilterProps) {
  return (
    <div className="provider-filter" role="group" aria-label="Chat apps">
      <button
        type="button"
        className="provider-filter-chip"
        aria-pressed={value.length === 0}
        onClick={() => onChange([])}
      >
        All apps
      </button>
      {HISTORY_PROVIDERS.map((provider) => (
        <button
          key={provider}
          type="button"
          className="provider-filter-chip"
          aria-pressed={value.includes(provider)}
          onClick={() => onChange(toggleProvider(value, provider))}
        >
          {formatProvider(provider)}
        </button>
      ))}
    </div>
  );
}
