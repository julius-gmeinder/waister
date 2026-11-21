# 0011: Full-page app page with hash routes, ui/ split per surface

**Status:** Accepted (2026-11-21). Partly supersedes [0010](0010-react-popup.md) (the
"`ui/` itself is the popup root" layout).

## Context

Beyond the 24h summary in the popup, Waister needs room for Analytics, Facts, Tips and History.
A toolbar popup is too small for that, so these become full-screen extension pages. The popup
stays the dashboard.

## Decision

- **One app page** (`app/index.html`) with **hash routes** (`#/analytics`, `#/facts`, `#/tips`,
  `#/history`) instead of one HTML file per page. A small `useSyncExternalStore` + `hashchange`
  reader in `App`, no router library.
- **Navigation:** the popup gets a **tab bar** (one tab per route) that opens the route in a new
  browser tab (`chrome.tabs.create`). The app page has a **sidebar** with the same routes and
  switches in place.
- **Routes in one place:** `ui/app-routes.ts` (`APP_ROUTES`: id, label, icon), used by both the
  TabBar and the Sidebar.
- **`ui/` layout per surface:**
  - `ui/popup/`: popup.html, popup.css, popup.app.tsx
  - `ui/app/`: app.html, app.css, app.app.tsx, `pages/*.page.tsx`
  - `ui/components/`: components shared by both, plus `components.css`
  - `ui/base.css`: tokens, fonts, element defaults (shared)
- New role suffix `*.page.tsx` for route components. New entry `entries/app.entry.tsx`.
- Shared CSS (`base.css`, `components.css`) is imported by both entries. Each surface keeps only
  its layout in its own CSS file.

## Consequences

- One more bundle: `app/index.js` (~225 KB, its own copy of React). It loads only when the app
  tab is open.
- Font files move from `popup/fonts/` to a shared `fonts/` at the extension root.
- Switching pages inside the app tab doesn't reload, and back/forward works through the hash.
- Every tab bar click opens a new tab. Reusing an open app tab would need the `tabs` permission,
  so that was left out on purpose.
- The app page is a new runtime context ("app page", an extension page like the popup). The same
  import rules as for the popup apply: `ui/` imports only `dto/` and `messages/`.
- Rejected alternatives: one HTML + entry per page (5× React, a reload on every switch); a tab bar
  in the app page too (the user chose a sidebar there).
