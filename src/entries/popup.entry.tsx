/**
 * Popup entry: mounts the React popup app.
 *
 * Context: popup
 * Docs: docs/modules.md#entries
 */

// Styles: esbuild bundles these into popup/index.css and copies the font files to popup/fonts/.
import '@fontsource-variable/inter/opsz.css';
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/700.css';
import '../ui/popup.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from '../ui/popup.app';

// Loaded with `defer`, so #root is already parsed when this runs.
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <PopupApp />
    </StrictMode>,
  );
}
