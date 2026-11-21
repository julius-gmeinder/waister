/**
 * Content script entry: starts the DOM capture strategy.
 *
 * Context: content script
 * Docs: docs/modules.md#entries
 */

import { startDomCaptureStrategy } from '../readers/strategies/dom-capture.strategy';

startDomCaptureStrategy();
