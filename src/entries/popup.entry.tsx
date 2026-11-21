/**
 * Popup entry: mounts the React popup app.
 *
 * Context: popup
 * Docs: docs/modules.md#entries
 */

import '../ui/base.css';
import '../ui/components/components.css';
import '../ui/popup/popup.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from '../ui/popup/popup.app';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <PopupApp />
    </StrictMode>,
  );
}
