/**
 * PageTitle: the serif headline at the top of every app page.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { ReactNode } from 'react';

interface PageTitleProps {
  children: ReactNode;
}

export function PageTitle({ children }: PageTitleProps) {
  return <h1 className="page-title">{children}</h1>;
}
