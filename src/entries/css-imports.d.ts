/**
 * CSS import types: lets TypeScript accept side-effect CSS imports (`import '../ui/base.css'`).
 * esbuild bundles them into each entry's index.css, so they export nothing.
 *
 * Context: popup, app page
 * Docs: docs/modules.md#entries
 */

declare module '*.css';
