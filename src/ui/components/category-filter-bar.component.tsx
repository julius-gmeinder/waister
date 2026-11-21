/**
 * CategoryFilterBar: category filter pills on the left (using shared ChipGroup + Chip) and a
 * subtle "Hide adopted" toggle on the right for the Tips page.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { TIP_CATEGORIES, type TipFilterId } from '../app/pages/tips-catalog.helpers';
import { Chip } from './chip.component';
import { ChipGroup } from './chip-group.component';

interface CategoryFilterBarProps {
  selectedCategory: TipFilterId;
  onCategoryChange: (category: TipFilterId) => void;
  hideAdopted: boolean;
  onHideAdoptedChange: (hide: boolean) => void;
}

export function CategoryFilterBar({
  selectedCategory,
  onCategoryChange,
  hideAdopted,
  onHideAdoptedChange,
}: CategoryFilterBarProps) {
  return (
    <div className="tips-filter-bar">
      <ChipGroup label="Tip categories">
        {TIP_CATEGORIES.map((category) => (
          <Chip
            key={category.id}
            pressed={category.id === selectedCategory}
            onClick={() => onCategoryChange(category.id)}
          >
            {category.label}
          </Chip>
        ))}
      </ChipGroup>

      <label className="tips-hide-adopted">
        <input
          type="checkbox"
          className="tips-hide-adopted-checkbox"
          checked={hideAdopted}
          onChange={(event) => onHideAdoptedChange(event.target.checked)}
        />
        <span>Hide adopted</span>
      </label>
    </div>
  );
}
