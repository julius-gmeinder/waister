/**
 * MessageHandler: routes a runtime message to its handler.
 * Returns `undefined` for an unrecognized type, so the listener can decline the message instead of
 * keeping its channel open.
 *
 * Context: background
 * Docs: docs/modules.md#handlers
 */

import type { RuntimeMessage } from '../messages/runtime-messages';
import { handleEstimation } from './estimation.handler';
import { handleGetPrivacyConsent, handleSetPrivacyConsent } from './privacy.handler';
import {
  handleClearPromptRecords,
  handleGetPromptHistory,
  handleGetPromptRecords,
  handleGetUsageSummary,
} from './usage.handler';

export function handleRuntimeMessage(message: RuntimeMessage): Promise<unknown> | undefined {
  switch (message.type) {
    case 'ESTIMATE_PROMPT':
      return handleEstimation(message.payload);
    case 'GET_USAGE_SUMMARY':
      return handleGetUsageSummary(message.payload.sinceMs);
    case 'GET_PROMPT_RECORDS':
      return handleGetPromptRecords(message.payload.sinceMs);
    case 'CLEAR_PROMPT_RECORDS':
      return handleClearPromptRecords(Boolean(message.payload?.legacyOnly));
    case 'GET_PROMPT_HISTORY':
      return handleGetPromptHistory(message.payload);
    case 'GET_PRIVACY_CONSENT':
      return handleGetPrivacyConsent();
    case 'SET_PRIVACY_CONSENT':
      return handleSetPrivacyConsent(Boolean(message.payload.accepted));
    default:
      return undefined;
  }
}
