# styling

## css files

| File                               | Holds                                                                                               | Imported by       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------- |
| `src/ui/base.css`                  | font imports, color/font variables, `body`, `.lucide` defaults                                      | both entries      |
| `src/ui/components/components.css` | styles of the shared components, one commented block per component, incl. their keyframes           | both entries      |
| `src/ui/popup/popup.css`           | popup layout only (`.popup`, `.popup-header`, `.popup-impacts`)                                     | `popup.entry.tsx` |
| `src/ui/app/app.css`               | app page layout only (`.app`, `.app-content`, `.dashboard*`, `.history*`, `.facts*`, `.analytics*`) | `app.entry.tsx`   |

Each entry imports them in this order, and esbuild bundles them into `popup/index.css` /
`app/index.css`. A new component's styles go into `components.css`, and a new surface's layout
into its own CSS file.

**Class names** are flat kebab-case and prefixed with the component name (`.breakdown`,
`.breakdown-row`, `.tab-bar-link`, `.sidebar-link`). Don't nest selectors by element (no
`.breakdown li`).

## logos

- logo with text: public/logo/waister-full.svg (`header.component.tsx`, 120px wide: popup top,
  sidebar top)
- logo only: public/logo/waister.svg

`public/` is copied to the extension root, so the UI references logos by absolute path
(`/logo/waister-full.svg`), not by import.

## colors

Defined as CSS variables on `:root` in `src/ui/base.css`. Always use the variable, never
the hex value.

| Variable            | Value                 | Use                                                            |
| ------------------- | --------------------- | -------------------------------------------------------------- |
| `--bg`              | `#FBF8EE`             | page background (`body`), whole popup, app sidebar             |
| `--surface`         | `#FFFFFF`             | panels on top of `--bg` (`.breakdown`), app content area       |
| `--border`          | `#EFE8CF`             | 1px borders (`.breakdown`)                                     |
| `--accent`          | `#FEF199`             | soft yellow: the selected item (current page in the sidebar)   |
| `--accent-hover`    | `#FDEB7A`             | selected item, hovered                                         |
| `--accent-pressed`  | `#FCE45C`             | selected item, pressed                                         |
| `--neutral-hover`   | `#F3EDD9`             | unselected item on `--bg`, hovered                             |
| `--neutral-pressed` | `#EAE2C6`             | unselected item on `--bg`, pressed                             |
| `--focus`           | = `--contrast-bright` | keyboard focus ring                                            |
| `--contrast`        | `#2E2A8C`             | emphasized text (page titles, headings)                        |
| `--contrast-bright` | `#4F46E5`             | icons                                                          |
| `--text`            | `#1C1917`             | body text                                                      |
| `--text-muted`      | `#57534E`             | secondary text (period line, tab labels, placeholders)         |
| `--tokens`          | `#8A5A00`             | brass gold: every token number (TokenCount) and the Coins icon |
| `--tokens-soft`     | `#F4DC9C`             | light brass: coin face in the TokenTotalCard animation         |
| `--watermark`       | `#EBE2C4`             | FactCard background icon, one tint for every KPI               |
| `--scrollbar`       | `#D8CEA8`             | thumb of the thin scrollbars (page, modal body)                |

### token numbers

Every token figure in the extension goes through the **TokenCount** component
(`token-count.component.tsx`), so it looks the same everywhere: the number in `--font-serif`,
700, `--tokens`, tabular digits, followed by a muted sans "tokens" unit (left out in lists whose
heading already says tokens, such as the popup breakdown and the modal legend). Only the size
differs: `inline` follows the surrounding text (sentences, day headers, HistoryRows, legends),
`large` is 28px (popup total) and `hero` 36px (PromptDetailModal total). An approximate
estimate has no badge or glyph: the count gets a `help` cursor and explains itself in its title
on hover. Don't style token numbers by hand. One exception: the TokenTotalCard (Dashboard,
Analytics) sets its unit like the impact cards' Wh / mL / g (20px serif 700 in `--tokens`, 6px
from the number), so the token tile and the cards below it read alike.

### impact accents

**ImpactBadge** (`impact-badge.component.tsx`) names the category of a tile (dashboard cards,
FactCards, the modal's impact tiles). It is a tab flush in the tile's top-left corner (absolute,
no inset). The tile's `overflow: hidden` rounds its outer corner, so the badge itself only rounds
its bottom-right corner (12px). Background `-soft`, text and the solid (filled) lucide icon
`-strong`, 13px sans at normal weight (Energy, Water, CO₂). Tiles leave top padding for it.

For everything that shows energy, water or CO2: the Dashboard's impact cards and the popup's
tachos (`.tacho--power` / `.tacho--water` / `.tacho--co2` map them onto `--tacho-color` /
`-strong` / `-soft`). Each
accent has three steps.

| Variable         | Value     | Use                                                                  |
| ---------------- | --------- | -------------------------------------------------------------------- |
| `--power`        | `#FF7A1A` | electric orange: bolts, sparks, gear strokes, glow, icons, tacho arc |
| `--power-strong` | `#D95A00` | energy numbers (≥ 3:1 on white for large text)                       |
| `--power-soft`   | `#FFE4CC` | gear fill, tacho track                                               |
| `--water`        | `#38B6E0` | coral-reef sky blue: drop, pond, stream, icons, tacho arc            |
| `--water-strong` | `#0B84B0` | water numbers, ripple                                                |
| `--water-soft`   | `#C9ECF8` | back wave, tacho track                                               |
| `--co2`          | `#A3C41C` | toxic lime green: factory and cloud strokes, windows, icons, arc     |
| `--co2-strong`   | `#5A7D00` | CO2 numbers                                                          |
| `--co2-soft`     | `#E6F0B4` | factory and cloud fill, tacho track                                  |

### token categories

The six breakdown parts in the TokenBar and the PromptDetailModal's legend. Cool hues for the
visible (counted) parts, warm hues for the hidden (estimated) ones. Not the impact accents, so a
segment never reads as "energy" or "CO2". The set was checked with the dataviz palette validator
(lightness band, chroma, CVD and normal-vision separation of **neighbors in this order**), so keep
the order of `TOKEN_CATEGORIES` when changing a value. Three of them are below 3:1 on white, which
is why the legend always shows the numbers next to the swatches.

Each `.token-bar-segment--<field>` only sets `--segment-color`. The modal (thick bar, legend
swatches) uses it as is. HistoryRows show many bars at once, so their thin bar mixes it 55% into
`--bg` and only shows the full color on hover. In a row, two or more categories below
`ui.history.otherSegmentShare` (5%) of the total merge into one `--token-other` pill labelled
"Other (…)".

| Variable           | Value              | Use                                                       |
| ------------------ | ------------------ | --------------------------------------------------------- |
| `--token-input`    | `#2A78D6`          | input (blue)                                              |
| `--token-history`  | `#1BAF7A`          | history (aqua)                                            |
| `--token-output`   | `#6250D6`          | output (violet)                                           |
| `--token-thinking` | `#E87BA4`          | thinking (magenta)                                        |
| `--token-tools`    | `#EDA100`          | tools (yellow)                                            |
| `--token-overhead` | `#E34948`          | overhead (red)                                            |
| `--token-other`    | `#A8A29E`          | merged tiny categories in a HistoryRow (stone)            |
| `--token-hatch`    | white 45%          | stripes over hidden segments (thick bar, legend swatches) |
| `--backdrop`       | `--text` 40%       | dimmed page behind the PromptDetailModal                  |
| `--shadow`         | soft, `--text` 25% | the PromptDetailModal's lift                              |

### interaction states

Every clickable item uses the same steps. Yellow means "selected", never "hovered", so the
current page stays recognizable. The sidebar (`aria-current="page"` on `.sidebar-link`) and the
Chips (`aria-pressed="true"` on `.chip`, used by the TimeframePicker and the ProviderFilter) have
a selected state. The popup tab bar always opens a new tab, so it has none. Navigation links
(sidebar, tab bar) keep icon and label in one color: `--text-muted` at rest, `--contrast-bright`
when hovered, pressed or current (the icon is `currentColor`). The History adds the
SortPicker select, HistoryRows, the "Load more" button and the modal's icon buttons and
conversation link (neutral states only). The Analytics page uses Chips for its metric,
timeframe and mode toggles and adds the InfoTooltip button and its action buttons (neutral
states only). Disabled buttons
(`:enabled` guard) don't react to hover.

| State                       | Unselected item (tab bar, sidebar link, chip)              | Selected (current page / pressed chip) |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| rest                        | transparent (chip: `--bg`), text `--text-muted` / `--text` | `--accent`                             |
| `:hover`                    | `--neutral-hover`, text `--text`                           | `--accent-hover`                       |
| `:active` (pressed)         | `--neutral-pressed`                                        | `--accent-pressed`                     |
| `:focus-visible` (keyboard) | 2px `--focus` outline, 2px offset                          | same                                   |

Icon color is set once in a grouped rule at the top of `components.css` (except the impact card and tacho
icons, which use their accent, and the navigation icons, which follow their link's text), and sizes per
component. Backgrounds and text colors fade over 120ms. The neutral tints sit between `--bg` and `--border`,
so they only work on a `--bg` background. The state rules live at the end of `components.css`. A new
clickable component gets added to those selectors instead of defining its own colors.

## layout

Both surfaces are flat: no wrappers, floating cards or rounded outer corners. `body` is `--bg`
(`base.css`).

- **Popup:** `body` is `--surface` (`408px` wide) so whitespace frames the flat `--bg` tiles just
  like the app pages. `.popup` (padding `18px 24px 16px`, `20px` gap) stacks a compact top bar
  (logo left, prompt count + `TimeframeSelect` dropdown pill right, offering the Dashboard's
  timeframes in a floating `--surface` / `--border` / `--shadow` menu with `--accent` on the active
  option), four stacked horizontal `84px`-tall tiles (`TokenTotalCard`, `PowerCard`, `WaterCard`,
  `Co2Card`, all `variant="compact"` with a flush full-height `74px` coloured left badge strip —
  centered icon over label in `--tokens-soft`/`--tokens`, `--power-soft`/`--power-strong`,
  `--water-soft`/`--water-strong`, `--co2-soft`/`--co2-strong` — a vertically centered 26px serif
  value beside it and the animation as a strip from the number to the tile's right edge) and the
  `TabBar`. Every tab is 68px wide (fits
  "Dashboard"), spare width goes between them. The tab bar has no divider; whitespace separates it
  from the tiles above.
- **App page:** `.app` is a grid: the Sidebar (240px, `--bg`, full height, sticky) on the left,
  and the content (`.app-content`, `--surface`, padding 32px 40px) on the right. No border
  between them. Only the background color separates them.
- **Dashboard:** `.dashboard` stacks PageTitle, TimeframePicker, the TokenTotalCard (the same
  full-width token tile as the Analytics headline: 40px TokenCount, solid label, muted detail, no
  badge so no top gap) and `.dashboard-cards` (three equal columns, one column below 1080px). The PowerCard, WaterCard
  and Co2Card are tiles (see below) with an ImpactBadge in the top-left corner. A stage (max
  360px, centered) holds the serif number (40px) right-aligned at the top, the inline SVG scene
  tucked 10px up under it and the ImpactFact at the bottom (serif multiplier in the accent `-strong`,
  muted phrase, bold `shortCopy`, like a small FactCard). Bolts leave the scene's top right,
  just under the digits; the drop (an HTML element on the stage) leaves the number's left side. All scenes share one viewBox (240 × 170) and ground
  line (y ≈ 160: gear bottoms, pond front, factory floor), so they line up side by side. The
  stream and smoke run past the scene; the tile clips them.

- **Tiles:** every card and row looks like the HistoryRow: `--bg` background, 12px radius, no
  border, no shadow. One grouped rule in `components.css` gives the dashboard cards, FactCards and
  the modal's impact tiles that look (plus `position: relative` and `overflow: hidden` for the
  ImpactBadge). Only clickable tiles (HistoryRows) have hover states.
- **History:** `.history` stacks PageTitle, one controls row (`.history-filters` with the
  TimeframePicker, All time first via `HISTORY_TIMEFRAMES`, and the ProviderFilter side by side,
  28px apart instead of a divider, and the SortPicker on the right), a flat `--bg` summary strip
  and the list (max 1000px). No horizontal rules anywhere: day groups are 36px apart, and each has
  a sticky header on plain `--surface` (padding 20px top, 14px bottom) with only the serif day name
  and the prompt count. The figures live in the summary strip and the rows. The summary strip uses
  the row's columns (`1fr | auto | 150px` with the row's 16px side padding and 20px gap): prompt
  count on the left, then ImpactFigures and the TokenCount, so they line up with the rows'
  figures. A HistoryRow is a tile: a full-width button, 8px apart, so the gap separates the
  rows and the neutral hover tints apply. Its grid is `64px | 1fr | auto | 150px`. The first line holds the time, the
  ProviderIcon + model, the ImpactFigures and the total (the fixed last column lines the impact
  figures up). The TokenBar spans the whole second line. Below 760px model, total and impact stack
  next to the time, with the bar below, and the summary drops its columns.
- **TokenBar:** each category is its own fully rounded pill, 4px apart (8px high in rows, 14px in
  the modal, at least 6px wide). Hovering a segment shows a dark label above it (`Input · 1,234`,
  from `data-label` via `::after`). Muted colors and the "Other" pill in rows, see
  [token categories](#token-categories).
- **ProviderIcon:** inline SVG look-alikes of the chat app logos (Claude sunburst, ChatGPT knot,
  Gemini sparkle), 18px, colored by `--provider-claude` / `--provider-openai` /
  `--provider-gemini-start` → `-end`. They replace the name chip in the HistoryRow and the modal
  title (the name is the SVG's `<title>` / `aria-label`).
- **SortPicker:** the select uses `appearance: none` with a lucide `ChevronDown` laid over it, so
  the arrow keeps the same inset from the rounded edge as the text on the left.
- **PromptDetailModal:** native `<dialog>` (max 620px wide), the second exception to "no floating
  cards": 1px `--border`, 16px radius, `--shadow`, `--backdrop` behind it. Sections are split by
  whitespace (32px gap), not by lines. The impact tiles are tiles with an ImpactBadge. The legend
  rows show swatch, label, count and share (no category icons). "Open conversation" spans the
  footer's full width. The dialog clips (`overflow: hidden`) and its body scrolls, so the thin
  scrollbar stays inside the rounded corners. It fades and lifts in over 180ms (none with reduced motion), and the page behind it
  doesn't scroll (`body:has(.prompt-detail[open])`).
- **Facts:** `.facts-page` stacks a plain header (PageTitle + subtitle, scrolls with the page)
  and three sections. Each section has a serif title (Daily / Weekly / All-Time) with the
  timeframe's TokenCount and prompt count right next to it, then one row of FactCards (tiles with
  an ImpactBadge). All cards share one inner structure and stretch to the row's height (min
  200px), so badges, numbers, footers and watermarks line up. Variation is only in the column
  widths: Daily `1.5fr 1fr 1fr` (first card `--wide`, slightly larger sentence), Weekly three
  equal columns, All-Time `1fr 1fr 1.5fr` (last card wide). Inside, the text is top-anchored: the multiplier stands alone, then (16px below) the phrase and the sentence as one tight group.
  The raw numbers ("You used" / "This takes") sit in a small `--surface` box over the bottom-right
  corner (absolute, no reserved space). It fades in on hover only (always shown on touch screens)
  and may cover the sentence while shown. Below 1240px every card gets its own
  row. A card reads as one line of plain language: the
  multiplier (`~2.4×`, `45%`), a short phrase (`as much energy as`, `of the water for`) and one
  sentence (`shortCopy`, the technical `equivalent` as its hover title). The benchmark's SVG isn't
  boxed: it is a watermark in the top right, inside the card (18px inset, a fixed 120px in every
  card so they line up, one neutral `--watermark` tint for every KPI, `z-index: -1` inside the
  card's own stacking context). The phrase keeps clear of it, the sentence starts below
  it. No
  background blobs, colored borders or horizontal rules; the card footer is set apart by padding
  only.
- **Analytics:** `.analytics-page` stacks a plain header (PageTitle + subtitle), one filter row
  (metric and timeframe ChipGroups, 28px apart like the History), four KPI tiles, then
  ChartCards. Everything is a tile (shared rule). The first KPI tile (total tokens for "All",
  else the metric's total) spans the row with a 40px value like the Dashboard cards, the other
  three sit below it. Every KPI tile reads the same way: big colored value (32px), the label in
  solid `--text`, then a muted example. KPI tiles carry an ImpactBadge when they show energy,
  water or CO₂ and leave the same top padding without one, so values line up; token values use
  TokenCount; the change vs. the previous period is a small pill in the top-right
  corner. A ChartCard has a solid `--text` title (sans 650, like the FactCard sentence) with an
  indigo InfoTooltip (ⓘ, the third floating box: border + `--shadow`), a muted one-line insight and optional Chips or a legend on the right. The breakdown
  is one thick TokenBar (token category colors, hidden parts hatched, a 12px gap instead of a
  divider between the visible and the behind-the-scenes group) with a swatch legend per group. The
  model donut takes the token palette in its order (Other in `--token-other`), the model
  comparison bars one indigo that gets stronger the more a model uses, and the chat memory chart
  `--token-history` / `--token-input` columns over faint solid gridlines. Impact accents are only
  for energy, water and CO₂. The eco-insight is a tile with an ImpactBadge for the selected
  metric, the footer is set apart by padding only, and its buttons are pills like "Load more".
  Spacing follows the Facts page: tiles 18px apart, the header 32px above them, FactCard padding.
- **Tips:** the Facts rhythm (plain header, sections 36px apart, serif section title + muted meta,
  tiles 18px apart). A tip tile has two flush corner tabs mirroring the ImpactBadge: impact top left
  (accent fill), category top right (`--neutral-hover`, muted text). Text like a FactCard: muted
  hook, solid title, muted summary. The actions row comes before the example drawer, and each
  card is a two-row subgrid (text, actions) of the grid, so the buttons of neighbors line up and
  never move when an example opens.
- **Card text:** inside tiles, headings are solid `--text` (sans, weight 650) with muted text
  around them; serif is for numbers and page / section titles. An icon next to muted text takes
  that muted color.
- **Scrollbars:** thin everywhere, `--scrollbar` thumb on a transparent track (`:root` in
  `base.css`, the modal body opts in with `scrollbar-width: thin`).
- **No uppercase labels:** small labels (modal subheadings, card qualifiers) are sentence case,
  never `text-transform: uppercase` or letter-spaced.

## motion

**Page open:** tiles fade and lift in one after another (`tile-enter` in `components.css`, 380ms,
10px lift): the Dashboard's token tile and three cards, the FactCards, the History summary strip, the
HistoryRows and the Analytics tiles (KPIs 0–3, ChartCards 4–7, eco-insight 8). Each tile's `--enter-index` delays it by 45ms per step, capped at 12. The water and
CO2 cards set theirs in CSS, FactCards and HistoryRows get it as a prop (`enterIndex`), and
History rows restart the count with every loaded page, so "Load more" rows come in right away.
Only mounting plays it, so a new filter or timeframe doesn't replay it for tiles that stay.
Reduced motion turns it off.

The Dashboard cards animate with CSS only (keyframes in `components.css`). The components set
custom properties, and every animation derives from them:

| Property                                        | Set by    | Drives                                                                                            |
| ----------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `--pulse`                                       | PowerCard | number glow, gear step (one tooth per pulse), bolts (3 bolts take turns over 3 pulses)            |
| `--drip`                                        | WaterCard | number wobble, drop (swell, stretch, arc), plop (crown droplets, rebound jet, two rings)          |
| `offset-path` (inline)                          | WaterCard | the drop's arc in stage px, measured from the number's left edge (popup: fixed, from its right)   |
| `--pond-fill`                                   | WaterCard | pond water size (share of the banks), eases over 900ms                                            |
| `--gear-step`                                   | PowerCard | per gear: one tooth (360° / teeth), sign alternating along the train, so teeth stay meshed        |
| `--gear-teeth`, `--gear-turn`                   | PowerCard | outer layer: one tooth ahead per pulse (`steps`), so the inner ratchet's restart never snaps back |
| `--puff`                                        | Co2Card   | number haze (lime glow rising off it), average time between two clouds                            |
| `--cloud-count`                                 | Co2Card   | clouds in the loop; each loops every count × `--puff` ≈ `cloudRiseMs`                             |
| `--cloud-index`                                 | Co2Card   | start delay in `--puff`s: slot number plus a random head start                                    |
| `--cloud-rise`, `--cloud-drift`, `--cloud-grow` | Co2Card   | where a cloud ends and how much it swells, re-rolled per loop with its stack                      |
| `--bulge-rise`, `--bulge-w0` … `--bulge-w3`     | Co2Card   | the bulge's way up its stack and its width at four stops (shares of its widest size)              |

- **TokenTotalCard coins** (Dashboard only, the `coins` prop; Analytics stays still): three
  coins per 4.8s cycle (`--coin-cycle`, delays `--coin-index` / `--coin-count`) pop out next to
  the number, drop to the card's bottom edge (`--coin-ground`), skip along it in ever lower hops
  (squash on each landing), then roll off the right edge, where the tile clips them. The track is
  the card's second grid column, stretched over the padding to the card's edges. Three layers
  per coin: run (translateX), hop (`bottom`, so the drop can start at a % of the card height),
  coin (pop-in scale + spin). Fixed timing, not usage-driven; no coins while loading or at 0.
- The periods come from `config.json` → `ui.dashboard` (via `dashboard.helpers.ts`). More CO2
  means more clouds at the same rise speed, not faster clouds. No usage means no smoke, no
  `--pulse` / `--drip` and an `--idle` modifier class that removes the animations.
- Every cloud slot picks a random stack (chimney: small puffs, cooling towers: wide billows, one
  color for both) and a random rise, drift and size each time its loop restarts, so the stacks
  spew at random while the overall rate stays usage-driven.
- **Popup (`variant="compact"`):** the same motion, laid out sideways. Each scene is a
  `300 × 84` strip drawn at 1 unit = 1px (`preserveAspectRatio="xMinYMid slice"`), in the grid
  column after the number (`74px auto 1fr`), so it always starts at the number's right edge and
  the tile clips it on the right, whatever the number's width. PowerCard: a short zigzag gear train
  (big gears low, small ones high, a tiny one on the driver's top left) hit by short bolts from
  the number's right edge. WaterCard: the pond and stream at 0.55 (lines keep their width via
  `vector-effect`), a smaller drop gathering at the number's right edge on a fixed arc
  (`.water-card-strip` is its positioning box) and the wobble glow pulling right. Co2Card: a low
  skyline (hall + chimney, two towers, shed) on its own layout, set off from the number, smaller
  clouds and bulges. The value has `z-index: 1`, so bolts and drops start under it. Coins work as
  on the Dashboard, and every badge icon is solid (`fill: currentColor`).
- Before each cloud, a bulge travels up its stack (first 14% of the slot's loop) and pops at the
  top as the cloud comes out. The walls are drawn twice around the bulges (thick outline under,
  fill over), so a bulge only shows where it pushes the walls out. It is drawn at full size and
  only scaled down, because a scaled-up animated layer renders blurry.
- The stream, water glints, grass tufts, lily pad and chimney beacon move all the time
  (independent of usage). The pond level eases over 900ms
  when the timeframe changes.
- `prefers-reduced-motion: reduce` stops every animation and hides the drop and the coins. The values and the
  static scene stay. On Windows, "Animation effects" off counts as reduce.

### dark mode

There is no dark theme yet. When theming is needed, add a `@media (prefers-color-scheme: dark)`
block on `:root` in `base.css` that overrides the color variables. Components never check the
theme themselves, so they follow automatically.

## fonts

Bundled with the extension (no network request, works offline) through the
[Fontsource](https://fontsource.org) npm packages. `src/ui/base.css` `@import`s their CSS, so
both pages get them. esbuild puts the font files into `fonts/` at the extension root, shared by
popup and app page. The variables are defined on `:root` in `base.css`. Always use the variable.

| Variable       | Font                                  | npm package                                            | Weights             | Use                                                                  |
| -------------- | ------------------------------------- | ------------------------------------------------------ | ------------------- | -------------------------------------------------------------------- |
| `--font-sans`  | Inter Variable (fallback `system-ui`) | `@fontsource-variable/inter` (`opsz.css`)              | 100–900, opsz 14–32 | all text (`body`)                                                    |
| `--font-serif` | Libre Baskerville (fallback Georgia)  | `@fontsource/libre-baskerville` (`400.css`, `700.css`) | 400, 700            | headline numbers and titles (TokenCount, `.page-title`, card values) |

All script subsets are packaged (~450 KB), but each `@font-face` has a `unicode-range`, so the
browser only loads the Latin files it needs (~110 KB, from disk). A new weight is one more
`@import` in `base.css`.

## icons

[lucide-react](https://lucide.dev/icons/) components, imported where they are used
(`import { Coins } from 'lucide-react'`). The lucide site lists icons in kebab-case
(`message-square-text`), and the React component is the PascalCase name (`MessageSquareText`).

| Field / route | Icon                                        | Used in                                                               |
| ------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| totalTokens   | `Coins`                                     | `total.component.tsx` (in `--tokens`)                                 |
| model         | `Cpu`                                       | (not shown yet)                                                       |
| latencyMs     | `Timer`                                     | (not shown yet)                                                       |
| input         | `MessageSquare`                             | `token-category.helpers.ts`                                           |
| history       | `History`                                   | `token-category.helpers.ts`                                           |
| output        | `MessageSquareText`                         | `token-category.helpers.ts`                                           |
| thinking      | `Brain`                                     | `token-category.helpers.ts`                                           |
| tools         | `Wrench`                                    | `token-category.helpers.ts`                                           |
| overhead      | `Settings2`                                 | `token-category.helpers.ts`                                           |
| energyWh      | `Zap`                                       | tacho, power card, impact figures, detail modal                       |
| waterMl       | `Droplet`                                   | tacho, water card, impact figures, detail modal                       |
| co2Grams      | `Factory`                                   | tacho, CO2 card, impact figures, detail modal                         |
| Dashboard     | `LayoutDashboard`                           | `app-routes.ts`                                                       |
| Analytics     | `ChartColumn`                               | `app-routes.ts`                                                       |
| Facts         | `BookOpen`                                  | `app-routes.ts`                                                       |
| Tips          | `Lightbulb`                                 | `app-routes.ts`                                                       |
| History page  | `Clock`                                     | `app-routes.ts`, `history.page.tsx` (empty state)                     |
| sort          | `ArrowDownUp`                               | `sort-picker.component.tsx`                                           |
| select arrow  | `ChevronDown`                               | `sort-picker.component.tsx`                                           |
| prev / next   | `ChevronLeft/Right`                         | `prompt-detail-modal.component.tsx`                                   |
| close         | `X`                                         | `prompt-detail-modal.component.tsx`                                   |
| open chat     | `ExternalLink`                              | `prompt-detail-modal.component.tsx`                                   |
| methodology   | `Info`                                      | `info-tooltip.component.tsx`                                          |
| eco-insight   | `Leaf` / `Sparkles`                         | `analytics.page.tsx` (tip / not enough data)                          |
| tip category  | `ListChecks` / `PenLine` / `MessagesSquare` | `tip-card.component.tsx` (before you ask / how you ask / chat habits) |
| export, reset | `Download`, `Trash2`                        | `analytics.page.tsx`                                                  |
| legacy notice | `AlertTriangle`                             | `analytics.page.tsx`                                                  |
| tech details  | `SlidersHorizontal`                         | `analytics.page.tsx`                                                  |

The History page uses `Clock`, not `History`, because `History` already marks the history
tokens in the breakdown.
