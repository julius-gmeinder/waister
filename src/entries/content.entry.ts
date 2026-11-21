/**
 * ContentEntry: content script entry, starts the DOM capture strategy.
 *
 * Context: content
 * Docs: docs/modules.md#entries
 */

import { startDomCaptureStrategy } from '../readers/strategies/dom-capture.strategy';

startDomCaptureStrategy();
