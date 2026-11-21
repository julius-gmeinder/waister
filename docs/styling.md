# styling

## css files

| File                               | Holds                                                                                     | Imported by       |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ----------------- |
| `src/ui/base.css`                  | font imports, color/font variables, `body`, `.lucide` defaults                            | both entries      |
| `src/ui/components/components.css` | styles of the shared components, one commented block per component, incl. their keyframes | both entries      |
| `src/ui/popup/popup.css`           | popup layout only (`.popup`, `.popup-period`)                                             | `popup.entry.tsx` |
| `src/ui/app/app.css`               | app page layout only (`.app`, `.app-content`, `.dashboard*`, `.history*`)                 | `app.entry.tsx`   |

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

| Variable            | Value                 | Use                                                          |
| ------------------- | --------------------- | ------------------------------------------------------------ |
| `--bg`              | `#FBF8EE`             | page background (`body`), whole popup, app sidebar           |
| `--surface`         | `#FFFFFF`             | panels on top of `--bg` (`.breakdown`), app content area     |
| `--border`          | `#EFE8CF`             | 1px borders (`.breakdown`)                                   |
| `--accent`          | `#FEF199`             | soft yellow: the selected item (current page in the sidebar) |
| `--accent-hover`    | `#FDEB7A`             | selected item, hovered                                       |
| `--accent-pressed`  | `#FCE45C`             | selected item, pressed                                       |
| `--neutral-hover`   | `#F3EDD9`             | unselected item on `--bg`, hovered                           |
| `--neutral-pressed` | `#EAE2C6`             | unselected item on `--bg`, pressed                           |
| `--focus`           | = `--contrast-bright` | keyboard focus ring                                          |
| `--contrast`        | `#2E2A8C`             | emphasized text (total token count, page titles)             |
| `--contrast-bright` | `#4F46E5`             | icons                                                        |
| `--text`            | `#1C1917`             | body text                                                    |
| `--text-muted`      | `#57534E`             | secondary text (period line, tab labels, placeholders)       |

### impact accents

For everything that shows energy, water or CO2: the Dashboard's impact cards and the popup's
tachos (`.tacho--power` / `.tacho--water` / `.tacho--co2` map them onto `--tacho-color` /
`-strong` / `-soft`). Each
accent has four steps.

| Variable         | Value     | Use                                                                  |
| ---------------- | --------- | -------------------------------------------------------------------- |
| `--power`        | `#FF7A1A` | electric orange: bolts, sparks, gear strokes, glow, icons, tacho arc |
| `--power-strong` | `#D95A00` | energy numbers (≥ 3:1 on white for large text)                       |
| `--power-soft`   | `#FFE4CC` | gear fill, tacho track                                               |
| `--power-tint`   | `#FFF7F0` | bottom of the PowerCard background gradient                          |
| `--water`        | `#38B6E0` | coral-reef sky blue: drop, basin, front wave, icons, tacho arc       |
| `--water-strong` | `#0B84B0` | water numbers, ripple                                                |
| `--water-soft`   | `#C9ECF8` | back wave, tacho track                                               |
| `--water-tint`   | `#F1FAFD` | bottom of the WaterCard background gradient                          |
| `--co2`          | `#A3C41C` | toxic lime green: factory and cloud strokes, windows, icons, arc     |
| `--co2-strong`   | `#5A7D00` | CO2 numbers                                                          |
| `--co2-soft`     | `#E6F0B4` | factory and cloud fill, tacho track                                  |
| `--co2-tint`     | `#F8FBE8` | bottom of the Co2Card background gradient                            |

### token categories

The six breakdown parts in the TokenBar and the PromptDetailModal's legend. Cool hues for the
visible (counted) parts, warm hues for the hidden (estimated) ones. Not the impact accents, so a
segment never reads as "energy" or "CO2". The set was checked with the dataviz palette validator
(lightness band, chroma, CVD and normal-vision separation of **neighbors in this order**), so keep
the order of `TOKEN_CATEGORIES` when changing a value. Three of them are below 3:1 on white, which
is why the legend always shows the numbers next to the swatches.

| Variable           | Value              | Use                                                       |
| ------------------ | ------------------ | --------------------------------------------------------- |
| `--token-input`    | `#2A78D6`          | input (blue)                                              |
| `--token-history`  | `#1BAF7A`          | history (aqua)                                            |
| `--token-output`   | `#6250D6`          | output (violet)                                           |
| `--token-thinking` | `#E87BA4`          | thinking (magenta)                                        |
| `--token-tools`    | `#EDA100`          | tools (yellow)                                            |
| `--token-overhead` | `#E34948`          | overhead (red)                                            |
| `--token-hatch`    | white 45%          | stripes over hidden segments (thick bar, legend swatches) |
| `--backdrop`       | `--text` 40%       | dimmed page behind the PromptDetailModal                  |
| `--shadow`         | soft, `--text` 25% | the PromptDetailModal's lift                              |

### interaction states

Every clickable item uses the same steps. Yellow means "selected", never "hovered", so the
current page stays recognizable. The sidebar (`aria-current="page"` on `.sidebar-link`) and the
TimeframePicker (`aria-pressed="true"` on `.timeframe-picker-chip`) have a selected state. The
popup tab bar always opens a new tab, so it has none. The History adds the ProviderFilter chips
(selected state like the TimeframePicker), the SortPicker select, HistoryRows, the "Load more"
button and the modal's icon buttons and conversation link (neutral states only). Disabled buttons
(`:enabled` guard) don't react to hover.

| State                       | Unselected item (tab bar, sidebar link, chip)              | Selected (current page / pressed chip) |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| rest                        | transparent (chip: `--bg`), text `--text-muted` / `--text` | `--accent`                             |
| `:hover`                    | `--neutral-hover`, text `--text`                           | `--accent-hover`                       |
| `:active` (pressed)         | `--neutral-pressed`                                        | `--accent-pressed`                     |
| `:focus-visible` (keyboard) | 2px `--focus` outline, 2px offset                          | same                                   |

Icon color is set once in a grouped rule at the top of `components.css` (except the impact card and tacho
icons, which use their accent), and sizes per
component. Backgrounds and text colors fade over 120ms. The neutral tints sit between `--bg` and `--border`,
so they only work on a `--bg` background. The state rules live at the end of `components.css`. A new
clickable component gets added to those selectors instead of defining its own colors.

## layout

Both surfaces are flat: no wrappers, floating cards or rounded outer corners. `body` is `--bg`
(`base.css`).

- **Popup:** `.popup` fills the whole popup window (padding 10px on top and 16px elsewhere).
  Inside: Header, Total, period line, Breakdown, ImpactTachos (three columns), TabBar. Every tab
  is 68px wide (fits "Dashboard"), spare width goes between them. The tab bar has no divider. 8px of extra
  top margin (on top of the 12px gap) sets it apart from the breakdown.
- **App page:** `.app` is a grid: the Sidebar (240px, `--bg`, full height, sticky) on the left,
  and the content (`.app-content`, `--surface`, padding 32px 40px) on the right. No border
  between them. Only the background color separates them.
- **Dashboard:** `.dashboard` stacks PageTitle, TimeframePicker, the token subtitle and
  `.dashboard-cards` (three equal columns, one column below 1080px). The PowerCard, WaterCard
  and Co2Card are the one exception to "no floating cards": 1px `--border`, 12px radius, a
  `--surface` → `-tint` gradient. Each card centers its label, the serif number (40px) and an
  inline SVG scene (max 320px wide, 28px of whitespace above it). All scenes share one viewBox
  (240 × 170) and ground line (y ≈ 160: gear bottoms, basin floor, factory floor), so they line
  up side by side.

- **History:** `.history` stacks PageTitle, TimeframePicker, a controls row (ProviderFilter left,
  SortPicker right), a flat `--bg` summary strip (no border) and the list (max 1000px). Day groups
  have a sticky header (serif day name, muted totals) over a 1px `--border` line. A HistoryRow is a
  full-width button, grid `64px | 1fr | 256px`: time, then model + total on the first line and
  TokenBar + ImpactFigures on the second. The fixed last column lines every bar up. Below 760px
  everything stacks next to the time.
- **PromptDetailModal:** native `<dialog>` (max 620px wide), the second exception to "no floating
  cards": 1px `--border`, 16px radius, `--shadow`, `--backdrop` behind it. Sections are split by
  1px `--border` lines. The impact tiles reuse the card look (border, `--surface` → `-tint`
  gradient). It fades and lifts in over 180ms (none with reduced motion), and the page behind it
  doesn't scroll (`body:has(.prompt-detail[open])`).

## motion

The Dashboard cards animate with CSS only (keyframes in `components.css`). The components set
custom properties, and every animation derives from them:

| Property                        | Set by    | Drives                                                                                     |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| `--pulse`                       | PowerCard | number glow, gear step (one tooth per pulse), bolts (3 bolts take turns over 3 pulses)     |
| `--drip`                        | WaterCard | number wobble (sags, snaps back on release), drop (swell, stretch, fall), ripple           |
| `--drop-fall`                   | WaterCard | fall distance from the number to the pool surface, follows the fill level                  |
| `--gear-step`                   | PowerCard | per gear: 45° / −45° / −60°, so meshed teeth stay in each other's gaps                     |
| `--puff`                        | Co2Card   | number haze (lime glow rising off it), time between two clouds (delay per `--cloud-index`) |
| `--cloud-count`                 | Co2Card   | clouds in the loop; each loops every count × `--puff` ≈ `cloudRiseMs`                      |
| `--cloud-rise`, `--cloud-drift` | Co2Card   | per chimney: where a cloud ends (up, and right with the wind)                              |

- The periods come from `config.json` → `ui.dashboard` (via `dashboard.helpers.ts`). More CO2
  means more clouds at the same rise speed, not faster clouds. No usage means no smoke, no
  `--pulse` / `--drip` and an `--idle` modifier class that removes the animations.
- The pool sways all the time (3.6s / 5.2s, independent of usage). The level eases over 900ms
  when the timeframe changes.
- `prefers-reduced-motion: reduce` stops every animation and hides the drop. The values and the
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

| Variable       | Font                                  | npm package                                            | Weights             | Use                                                                      |
| -------------- | ------------------------------------- | ------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------ |
| `--font-sans`  | Inter Variable (fallback `system-ui`) | `@fontsource-variable/inter` (`opsz.css`)              | 100–900, opsz 14–32 | all text (`body`)                                                        |
| `--font-serif` | Libre Baskerville (fallback Georgia)  | `@fontsource/libre-baskerville` (`400.css`, `700.css`) | 400, 700            | headline numbers and titles (`.total-value`, `.page-title`, card values) |

All script subsets are packaged (~450 KB), but each `@font-face` has a `unicode-range`, so the
browser only loads the Latin files it needs (~110 KB, from disk). A new weight is one more
`@import` in `base.css`.

## icons

[lucide-react](https://lucide.dev/icons/) components, imported where they are used
(`import { Coins } from 'lucide-react'`). The lucide site lists icons in kebab-case
(`message-square-text`), and the React component is the PascalCase name (`MessageSquareText`).

| Field / route | Icon                | Used in                                           |
| ------------- | ------------------- | ------------------------------------------------- |
| totalTokens   | `Coins`             | `total.component.tsx`                             |
| model         | `Cpu`               | (not shown yet)                                   |
| latencyMs     | `Timer`             | (not shown yet)                                   |
| input         | `MessageSquare`     | `token-category.helpers.ts`                       |
| history       | `History`           | `token-category.helpers.ts`                       |
| output        | `MessageSquareText` | `token-category.helpers.ts`                       |
| thinking      | `Brain`             | `token-category.helpers.ts`                       |
| tools         | `Wrench`            | `token-category.helpers.ts`                       |
| overhead      | `Settings2`         | `token-category.helpers.ts`                       |
| energyWh      | `Zap`               | tacho, power card, impact figures, detail modal   |
| waterMl       | `Droplet`           | tacho, water card, impact figures, detail modal   |
| co2Grams      | `Factory`           | tacho, CO2 card, impact figures, detail modal     |
| Dashboard     | `LayoutDashboard`   | `app-routes.ts`                                   |
| Analytics     | `ChartColumn`       | `app-routes.ts`                                   |
| Facts         | `BookOpen`          | `app-routes.ts`                                   |
| Tips          | `Lightbulb`         | `app-routes.ts`                                   |
| History page  | `Clock`             | `app-routes.ts`, `history.page.tsx` (empty state) |
| sort          | `ArrowDownUp`       | `sort-picker.component.tsx`                       |
| prev / next   | `ChevronLeft/Right` | `prompt-detail-modal.component.tsx`               |
| close         | `X`                 | `prompt-detail-modal.component.tsx`               |
| open chat     | `ExternalLink`      | `prompt-detail-modal.component.tsx`               |

The History page uses `Clock`, not `History`, because `History` already marks the history
tokens in the breakdown.
