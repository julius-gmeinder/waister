/**
 * PrivacyHandler: answers the privacy notice's consent reads and writes.
 *
 * Context: background
 * Docs: docs/modules.md#handlers
 */

import type { PrivacyConsentDto } from '../dto/privacy-consent.dto';
import {
  getPrivacyConsent,
  setPrivacyConsent,
} from '../services/privacy-consent/privacy-consent.service';

export function handleGetPrivacyConsent(): Promise<PrivacyConsentDto> {
  return getPrivacyConsent();
}

export function handleSetPrivacyConsent(accepted: boolean): Promise<PrivacyConsentDto> {
  return setPrivacyConsent(accepted);
}
