/**
 * ChatReader facade: delegates to `dom-capture.strategy.ts` which consolidates all site adapters
 * (WHERE) with the timing/stream-completion logic (WHEN) and builds one `ChatCaptureDto` per
 * finished prompt.
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
