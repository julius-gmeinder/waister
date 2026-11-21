/**
 * App page entry: mounts the React app (Analytics, Facts, Tips, History).
 *
 * Context: app page
 * Docs: docs/modules.md#entries
 */

import '../ui/base.css';
import '../ui/components/components.css';
import '../ui/app/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../ui/app/app.app';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
