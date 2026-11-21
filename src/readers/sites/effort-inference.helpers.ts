/**
 * EffortInference: thinking-effort defaults from `config.json` (`capture.effortInference`).
 * Internal to `sites/`. JSON values are plain strings, so they are validated here and an invalid
 * one falls back to `unknown`.
 *
 * Context: content
 * Docs: docs/modules.md#site-adapters
 */

import { capture } from '../../config/config.json';
import type { CaptureConfig } from '../../config/config.types';
import type { ThinkingEffort } from '../../dto/chat-capture.dto';

const EFFORT_INFERENCE: CaptureConfig['effortInference'] = capture.effortInference;

const VALID_EFFORTS: Record<ThinkingEffort, true> = {
  none: true,
  low: true,
  medium: true,
  high: true,
  unknown: true,
};

function toThinkingEffort(value: string | undefined): ThinkingEffort {
  if (value === undefined) return 'unknown';
  if (Object.hasOwn(VALID_EFFORTS, value)) return value as ThinkingEffort;
  console.warn('[waister]', `invalid thinking effort "${value}" in config.json, using "unknown"`);
  return 'unknown';
}

/** Effort when the UI shows that thinking is on, but not at which level. */
export const THINKING_DETECTED_EFFORT: ThinkingEffort = toThinkingEffort(
  EFFORT_INFERENCE.thinkingDetected,
);

/** Effort of a model family when the UI shows no thinking signal (`unknown` if not configured). */
export function familyDefaultEffort(family: string): ThinkingEffort {
  const familyDefaults: Partial<Record<string, string>> = EFFORT_INFERENCE.familyDefaults;
  return toThinkingEffort(familyDefaults[family]);
}
