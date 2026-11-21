# 0016: One UI look: shared tile, token, badge and chip components

**Status:** Accepted (2026-11-21)

## Context

The Dashboard ([ADR 0014](0014-dashboard-page.md)), the History ([ADR 0015](0015-history-page.md))
and the Facts page grew separately and looked like three products: bordered gradient cards next to
glassy cards with colored borders and background blobs, token numbers styled by hand in five
different ways, uppercase letter-spaced labels, horizontal rules between rows and sections, name
chips for the chat apps, and a Facts layout of offset bento cards that never lined up. The Facts
page also reshuffled on every visit and had a manual Shuffle button.

## Decision

- **The HistoryRow is the reference look.** Every card and row is a tile: `--bg`, 12px radius, no
  border, no shadow, no gradient (one grouped rule in `components.css`). Dashboard cards,
  FactCards and the modal's impact tiles share it. Only clickable tiles have hover states.
- **No horizontal rules and no uppercase labels.** Whitespace and padding separate rows, groups and
  modal sections. Small labels are sentence case.
- **Shared components instead of per-page markup:**
  - `TokenCount`: every token number (serif, brass `--tokens`, muted "tokens" unit), sizes
    `inline` / `large` / `hero`. An approximate estimate explains itself on hover; there are no
    "≈ approximate" badges.
  - `ImpactBadge`: names energy / water / CO₂ as a tab in a tile's top-left corner (soft fill,
    `-strong` text, solid icon).
  - `Chip` + `ChipGroup`: the TimeframePicker and ProviderFilter pills.
  - `ProviderIcon`: inline SVG look-alikes of the chat app logos replace the provider name chips.
- **History:** filters in one row (timeframe with All time first, chat apps, sort). The summary
  strip uses the row's columns, so its figures line up with every row; day headers only name the
  day. Row TokenBars are muted pills with hover labels, and several tiny categories merge into one
  "Other" pill (`ui.history.otherSegmentShare`).
- **Facts:** one row of equal-height cards per section, variation only in column widths (Daily
  wide first, Weekly even, All-Time wide last). Fixed inner structure (multiplier alone, then
  phrase + one sentence, raw numbers in a hover box) and a fixed-size watermark icon, so cards line
  up. Plain-language comparisons ("~2.4× as much water as"). The pick is seeded per
  `ui.facts.shuffleIntervalMinutes` (60): the same facts within an interval, no manual shuffle.
- **Page open:** tiles fade and lift in, staggered (`tile-enter`), on every page with tiles.
- **Navigation:** sidebar and tab bar icon + label share one color, neutral at rest, indigo on
  hover, press and the current page.

## Consequences

- A new page reuses the tile rule, TokenCount and ImpactBadge instead of styling its own; the
  conventions are in [styling.md](../styling.md).
- The per-accent `-tint` colors and the glass tokens are gone from `base.css`. The modal's legend
  has no category icons any more, and the modal scrolls its body, not the dialog.
- Supersedes the card look of ADR 0014 (bordered gradient cards) and the row details of ADR 0015
  (provider chip, approximate badge, per-day totals in the day headers). Their other decisions
  stay.
