# 0014: Dashboard page with timeframes and animated impact cards

**Status:** Accepted (2026-11-21), card look superseded by [0016](0016-unified-ui-look.md)

## Context

The ConversionService turns every prompt's tokens into an energy and water `impact`, and the
popup shows the last 24 hours of it in two tacho gauges. The app page ([ADR 0011](0011-app-page.md))
had only placeholder pages. Users need one page that shows tokens, energy and water for a chosen
period, and makes the numbers tangible instead of abstract.

## Decision

- **New route `dashboard`**, first in `APP_ROUTES` and the new `DEFAULT_ROUTE`. Analytics stays.
  The popup tab bar and the sidebar now have five entries.
- **Timeframes** (`ui/timeframe.helpers.ts`): Today (since local midnight), Last week and Last 30
  days (rolling 7 / 30 days), All time (`sinceMs = 0`). Picked with separate chips
  (`TimeframePicker`). Every visit starts on Today, the choice is not remembered.
- **Data:** the existing `GET_USAGE_SUMMARY { sinceMs }` message. `UsageSummaryDto` already
  carries the summed `impact` and gains `firstCapturedAt` and `queriedAtMs`. No new message.
- **Only `*.app.tsx` fetches:** `App` owns the timeframe state and fetches through
  `useUsageSummary(sinceMs)`, then passes timeframe, setter and summary to `DashboardPage`. The
  fetch logic (incl. the stale-worker `impact` fallback) moves from `PopupApp` into the shared
  `ui/usage-api.ts`, which both roots use.
- **Animation intensity** per card: `((usage ÷ active days) ÷ busyDay) ^ exponent`, clamped to
  0..1. Active days run from the oldest prompt in the window until the query, at least 1, so a
  new install isn't diluted over 30 empty days. All values live in `config.json` → `ui.dashboard`
  ([ADR 0012](0012-central-config.md)). Intensity sets the pulse period, the drip period and the
  pool level. Intensity 0 = no pulse and no drops.
- **Motion in CSS, not JS:** the cards pass `--pulse` / `--drip` / `--drop-fall` as custom
  properties. Glow, bolts, sparks and gear steps all derive from the same `--pulse`, so they stay
  in sync when it changes. SVG scenes are inline in the components (gear outlines are generated
  once at module load). `prefers-reduced-motion: reduce` stops all of it.
- **Accent colors** `--power*` (electric orange), `--water*` (coral-reef sky blue) and, added
  later with the third card (Co2Card, a factory puffing clouds), `--co2*` (dirty toxic green) in
  `base.css`, each with base, `-strong` (text), `-soft` (fills) and `-tint` (card background).
- **Cards are an exception to the flat layout:** the two impact cards have a 1px border and
  rounded corners. Everything else stays flat.
- **`PageTitle` component** for the headline of every app page.

## Consequences

- The impact is now visible. It is still an order-of-magnitude estimate, so the cards show it
  as a relative indicator (the motion) as much as a number.
- The app root fetches the summary on every app page, not only on the dashboard. It's one cheap
  local query.
- Users with "reduce motion" switched on at the OS level (for example Windows → Accessibility →
  Visual effects → Animation effects off) see static scenes.
- Rejected alternatives: intensity relative to the user's all-time average (All time would
  always be exactly 1×) or to the busiest day in the window (needs per-bucket queries); pages
  fetching their own data (would loosen the data-flow rule); a segmented control or dropdown
  as the picker (the user chose chips).
