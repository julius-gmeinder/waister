/**
 * Entry point of the content script (esbuild -> content.js).
 * Starts `dom-capture.strategy.ts`, which resolves the matching site adapter for the current host,
 * waits until a prompt's response finishes streaming, consolidates the DOM reads and timings into
 * a `ChatCaptureDto`, and sends it to `estimation.handler.ts` via `ESTIMATE_PROMPT`.
 *
 * Context: content script
 * Docs: docs/modules.md#entries
 */

import { startDomCaptureStrategy } from '../readers/strategies/dom-capture.strategy';

// Boot the consolidated DOM capture strategy when injected into a supported chat site
startDomCaptureStrategy();
