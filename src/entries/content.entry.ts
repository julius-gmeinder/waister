/**
 * ContentEntry: content script entry, starts the DOM capture strategy once the user has accepted
 * the privacy notice. Without consent the chat page is never read.
 * The answer is read once per page load: a change in the notice applies after a tab reload
 * (the background also refuses to save without consent, see estimation.handler).
 *
 * Context: content
 * Docs: docs/modules.md#entries
 */

import type {
  GetPrivacyConsentMessage,
  PrivacyConsentResponse,
} from '../messages/runtime-messages';
import { startDomCaptureStrategy } from '../readers/strategies/dom-capture.strategy';

const message: GetPrivacyConsentMessage = { type: 'GET_PRIVACY_CONSENT' };

chrome.runtime.sendMessage(message).then(
  (consent: PrivacyConsentResponse | undefined) => {
    if (consent?.status === 'accepted') startDomCaptureStrategy();
    else console.info('[waister] privacy notice not accepted, not reading this page');
  },
  (err: unknown) => console.warn('[waister] could not read privacy consent', err),
);
