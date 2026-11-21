# styling

## logos

- logo with text: public/logo/waister-full.svg
- logo only: public/logo/waister.svg

## colors

Defined as CSS variables on `:root` in `src/ui/popup/popup.css`. Always use the variable, never
the hex value.

| Variable            | Value     | Use                                                       |
| ------------------- | --------- | --------------------------------------------------------- |
| `--bg`              | `#FBF8EE` | page background (`body`)                                  |
| `--surface`         | `#FFFFFF` | cards and panels on top of `--bg` (`.breakdown`)          |
| `--border`          | `#EFE8CF` | 1px border around surfaces                                |
| `--accent`          | `#FDE100` | brand yellow: highlights and primary buttons (unused yet) |
| `--accent-hover`    | `#F0D400` | hover state of `--accent` elements (unused yet)           |
| `--contrast`        | `#2E2A8C` | emphasized text (total token count)                       |
| `--contrast-bright` | `#4F46E5` | icons                                                     |
| `--text`            | `#1C1917` | body text                                                 |
| `--text-muted`      | `#57534E` | secondary text (period line, captions)                    |

## icons

[lucide](https://lucide.dev/icons/), registered in `src/ui/popup/popup.view.ts` (`POPUP_ICONS`).

| Field       | Icon                  |
| ----------- | --------------------- |
| totalTokens | `coins`               |
| model       | `cpu`                 |
| latencyMs   | `timer`               |
| input       | `message-square`      |
| history     | `history`             |
| output      | `message-square-text` |
| thinking    | `brain`               |
| overhead    | `settings-2`          |
