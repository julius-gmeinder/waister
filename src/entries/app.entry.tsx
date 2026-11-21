/**
 * App page entry: mounts the full-screen React app (Analytics, Facts, Tips, History).
 *
 * Context: app page
 * Docs: docs/modules.md#entries
 */

// Styles: esbuild bundles these (plus the fonts imported by base.css) into app/index.css.
import '../ui/base.css';
import '../ui/components/components.css';
import '../ui/app/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../ui/app/app.app';

// Loaded with `defer`, so #root is already parsed when this runs.
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
