# 0010: Popup built with React + TSX components

**Status:** Accepted (2026-11-21). The `ui/` layout part is superseded by
[0011](0011-app-page.md) (the popup now lives in `ui/popup/`).

## Context

The popup was one static `popup.html` plus `popup.view.ts`, which patched `data-field` spans
by hand and swapped `<i data-lucide>` placeholders for SVGs through a manual icon registry
(`POPUP_ICONS`). That doesn't scale to more views (time ranges, per-prompt lists) and has no
component reuse.

## Decision

- The popup is a **React 19** app written in **TSX**. esbuild compiles `.tsx` natively
  (`tsconfig.json`: `"jsx": "react-jsx"`), so there's no new build tool or plugin.
- `src/ui/` itself is the popup root (no `ui/popup/` subfolder):
  - `popup.html`: only `<div id="root">`
  - `popup.css`: one stylesheet for all components (plain class names)
  - `popup.app.tsx`: `PopupApp`, the root component. It fetches `GET_USAGE_SUMMARY` and holds the
    state (`useState` + `useEffect` inside the component, no custom hook)
  - `components/*.component.tsx`: presentational components that only render props
- File names stay kebab-case with a role suffix: `*.app.tsx`, `*.component.tsx`. The popup entry
  becomes `entries/popup.entry.tsx`, because it renders JSX.
- Icons come from `lucide-react` components and replace `lucide` + `createIcons`.
- Components are functions. That fits [0004](0004-plain-function-modules.md), so no class
  components.

## Consequences

- `popup/index.js` grows to about 225 KB minified (react-dom). It loads only when the popup
  opens, never in a chat tab.
- The build defines `process.env.NODE_ENV` (`production` without `--watch`) so React drops its
  dev checks.
- MV3 CSP is unaffected: JSX is compiled ahead of time, with no `eval` and no inline scripts.
- Import rules are unchanged: `ui/` still imports only `dto/` and `messages/`.
- Rejected alternatives: Preact (smaller, but less familiar), Svelte/Vue (need esbuild plugins or
  Vite), WXT/Plasmo (would replace the whole build), Web Components (class-based).
