/**
 * ChatReader facade: re-exports the DOM capture strategy.
 *
 * Context: content script
 * Docs: docs/modules.md#readers, docs/dto.md
 */

export {
  SUPPORTED_SITES,
  buildChatCaptureDto,
  dispatchCaptureToEstimationHandler,
  domCaptureStrategy,
  resolveSiteAdapter,
  startDomCaptureStrategy,
} from './strategies/dom-capture.strategy';
