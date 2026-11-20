/**
 * Entry point of the content script (esbuild -> content.js).
 * Picks the site adapter for the current host and the reader strategy, starts the chat reader,
 * and sends each finished ChatCaptureDto to the background as an ESTIMATE_PROMPT message.
 *
 * Context: content script
 * Docs: docs/modules.md#entries
 */
export {};
