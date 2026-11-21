/**
 * Popup entry: boots the popup view.
 *
 * Context: popup
 * Docs: docs/modules.md#entries
 */

import { initPopupView } from '../ui/popup/popup.view';

// Loaded with `defer`, so the DOM is already parsed when this runs.
void initPopupView();
