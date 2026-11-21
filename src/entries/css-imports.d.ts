/**
 * Lets TypeScript accept side-effect CSS imports (`import '../ui/popup.css'`). esbuild bundles
 * them into popup/index.css. They export nothing.
 *
 * Context: popup (type-only)
 * Docs: docs/modules.md#entries
 */

declare module '*.css';
