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
import { Chip } from './chip.component';
import { ChipGroup } from './chip-group.component';

interface ProviderFilterProps {
  /** Empty = all providers. */
  value: Provider[];
  onChange: (providers: Provider[]) => void;
}

export function ProviderFilter({ value, onChange }: ProviderFilterProps) {
  return (
    <ChipGroup label="Chat apps">
      <Chip pressed={value.length === 0} onClick={() => onChange([])}>
        All apps
      </Chip>
      {HISTORY_PROVIDERS.map((provider) => (
        <Chip
          key={provider}
          pressed={value.includes(provider)}
          onClick={() => onChange(toggleProvider(value, provider))}
        >
          {formatProvider(provider)}
        </Chip>
      ))}
    </ChipGroup>
  );
}
