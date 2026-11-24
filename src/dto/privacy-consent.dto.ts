/**
 * PrivacyConsentDto: the user's answer to the privacy notice. Capture runs only while it is
 * `accepted` for the current policy version.
 *
 * Context: shared
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

/** `unset` until the user answers, and again whenever the policy version changes. */
export type PrivacyConsentStatus = 'unset' | 'accepted' | 'declined';

export interface PrivacyConsentDto {
  status: PrivacyConsentStatus;
  /** Policy version the answer refers to (`config.json` → `privacy.policyVersion`). */
  policyVersion: string;
  /** Epoch ms of the answer, `null` while `unset`. */
  decidedAt: number | null;
}
