/**
 * Entry point of the popup (esbuild -> popup/index.js).
 * Boots ui/popup/popup.view once the popup document has loaded.
 *
 * Context: popup
 * Docs: docs/modules.md#entries
 */

import { initPopupView } from '../ui/popup/popup.view';

// Loaded with `defer`, so the DOM is already parsed when this runs.
void initPopupView();
