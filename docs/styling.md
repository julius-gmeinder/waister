# styling

## logos

- logo with text: public/logo/waister-full.svg (popup header, `header.component.tsx`, 120px wide)
- logo only: public/logo/waister.svg

`public/` is copied to the extension root, so the popup references logos by absolute path
(`/logo/waister-full.svg`), not by import.

## colors

Defined as CSS variables on `:root` in `src/ui/popup.css`. Always use the variable, never
the hex value.

| Variable            | Value                            | Use                                                               |
| ------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `--bg`              | `#FBF8EE`                        | background of the rounded popup card (`.popup`)                   |
| `--surface`         | `#FFFFFF`                        | cards and panels on top of `--bg` (`.breakdown`)                  |
| `--border`          | `#EFE8CF`                        | 1px border around surfaces                                        |
| `--accent`          | `#FDE100`                        | brand yellow: highlights and primary buttons (unused yet)         |
| `--accent-hover`    | `#F0D400`                        | hover state of `--accent` elements (unused yet)                   |
| `--contrast`        | `#2E2A8C`                        | emphasized text (total token count)                               |
| `--contrast-bright` | `#4F46E5`                        | icons                                                             |
| `--frame`           | `#E7E5E4` light / `#1E1F20` dark | frame around the popup card (`body`, `.frame`), follows the theme |
| `--text`            | `#1C1917`                        | body text                                                         |
| `--text-muted`      | `#57534E`                        | secondary text (period line, captions)                            |

## layout

The browser draws the popup window with square corners, and CSS can't round them. So the
popup is two layers:

- `.frame`: fills the window, `--frame` background, 4px padding (`body` has the same
  background).
- `.popup`: the card inside it, `--bg` background, `border-radius: 16px`, padding 10px on top and 16px elsewhere.

### light / dark mode

`popup.css` follows the OS/browser theme through `@media (prefers-color-scheme: dark)`, which
overrides variables on `:root`. Components never check the theme themselves. For now only
`--frame` changes: a warm light gray in light mode, and in dark mode a near-black gray, so the
light card stands out clearly. The popup keeps its light look
in both modes, and the card doesn't change. To theme another color, override its variable in the same media query.

## fonts

Bundled with the extension (no network request, works offline) through the
[Fontsource](https://fontsource.org) npm packages. `src/entries/popup.entry.tsx` imports their
CSS, and esbuild emits it into `popup/index.css`, with the font files in `popup/fonts/`. The
variables are defined on `:root` in `src/ui/popup.css`. Always use the variable.

| Variable       | Font                                  | npm package                                            | Weights             | Use                               |
| -------------- | ------------------------------------- | ------------------------------------------------------ | ------------------- | --------------------------------- |
| `--font-sans`  | Inter Variable (fallback `system-ui`) | `@fontsource-variable/inter` (`opsz.css`)              | 100–900, opsz 14–32 | all text (`body`)                 |
| `--font-serif` | Libre Baskerville (fallback Georgia)  | `@fontsource/libre-baskerville` (`400.css`, `700.css`) | 400, 700            | headline numbers (`.total-value`) |

All script subsets are packaged (~450 KB), but each `@font-face` has a `unicode-range`, so the
browser only loads the Latin files it needs (~110 KB, from disk). A new weight is one more
import in `popup.entry.tsx`.

## icons

[lucide-react](https://lucide.dev/icons/) components, imported where they are used
(`import { Coins } from 'lucide-react'`). The lucide site lists icons in kebab-case
(`message-square-text`), and the React component is the PascalCase name (`MessageSquareText`).

| Field       | Icon                | Used in                   |
| ----------- | ------------------- | ------------------------- |
| totalTokens | `Coins`             | `total.component.tsx`     |
| model       | `Cpu`               | (not shown yet)           |
| latencyMs   | `Timer`             | (not shown yet)           |
| input       | `MessageSquare`     | `breakdown.component.tsx` |
| history     | `History`           | `breakdown.component.tsx` |
| output      | `MessageSquareText` | `breakdown.component.tsx` |
| thinking    | `Brain`             | `breakdown.component.tsx` |
| overhead    | `Settings2`         | `breakdown.component.tsx` |
