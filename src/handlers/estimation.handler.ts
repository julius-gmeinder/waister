/**
 * EstimationHandler: orchestrates one captured prompt: count tokens, estimate hidden tokens, save
 * to the database. Does nothing without the user's privacy consent: a tab opened before the user
 * declined still runs its content script, so the check belongs here, at the single write path.
 *
 * Context: background
 * Docs: docs/modules.md#handlers, docs/pipeline.md
 */

import type {
  AttachmentKind,
  ChatCaptureDto,
  Provider,
  ToolCallKind,
} from '../dto/chat-capture.dto';
import type { PromptRecordDto } from '../dto/prompt-record.dto';
import { convertTokensToImpact } from '../services/conversion/conversion.service';
import {
  buildTokenEstimateDto,
  estimateHiddenTokens,
} from '../services/estimation/estimation.service';
import { hasPrivacyConsent } from '../services/privacy-consent/privacy-consent.service';
import {
  createPromptRecord,
  savePromptRecord,
} from '../services/prompt-store/prompt-store.service';
import { countVisibleTokens } from '../services/tokenizer/tokenizer.service';

// Record types keep these in step with the unions: a new kind fails the typecheck until listed.
const PROVIDERS = new Set<string>(
  Object.keys({ openai: true, anthropic: true, google: true } satisfies Record<Provider, true>),
);
const ATTACHMENT_KINDS = new Set<string>(
  Object.keys({ image: true, file: true } satisfies Record<AttachmentKind, true>),
);
const TOOL_CALL_KINDS = new Set<string>(
  Object.keys({ search: true, code: true, other: true } satisfies Record<ToolCallKind, true>),
);

/**
 * Defends against a malformed capture that crossed the message boundary: trims text, clamps
 * negative times, drops attachments and tool calls of unknown kind (they would have no rate and
 * turn the total into NaN) and rejects an unknown provider.
 */
export function normalizeCaptureDto(captureDto: ChatCaptureDto): ChatCaptureDto {
  if (!PROVIDERS.has(captureDto.provider)) {
    throw new Error(`Unknown provider: ${String(captureDto.provider)}`);
  }
  const knownAttachments = (kinds: readonly AttachmentKind[] | undefined): AttachmentKind[] =>
    (kinds ?? []).filter((kind) => ATTACHMENT_KINDS.has(kind));

  return {
    provider: captureDto.provider,
    model: {
      name: captureDto.model.name,
      version: captureDto.model.version,
      thinkingEffort: captureDto.model.thinkingEffort,
      rawLabel: captureDto.model.rawLabel,
    },
    userInput: captureDto.userInput.trim(),
    userAttachments: knownAttachments(captureDto.userAttachments),
    response: captureDto.response.trim(),
    artifactText: (captureDto.artifactText ?? '').trim(),
    toolCalls: (captureDto.toolCalls ?? []).filter((kind) => TOOL_CALL_KINDS.has(kind)),
    chatHistory: captureDto.chatHistory.map((turn) => {
      const attachments = knownAttachments(turn.attachments);
      return {
        role: turn.role,
        text: turn.text.trim(),
        ...(attachments.length ? { attachments } : {}),
      };
    }),
    latencyMs: Math.max(0, captureDto.latencyMs),
    thinkingTimeMs: Math.max(0, captureDto.thinkingTimeMs),
    capturedAt: captureDto.capturedAt,
    conversationUrl: captureDto.conversationUrl,
  };
}

export async function handleEstimation(
  captureDto: ChatCaptureDto,
): Promise<PromptRecordDto | null> {
  if (!(await hasPrivacyConsent())) return null;
  const cleanedCapture = normalizeCaptureDto(captureDto);
  const visible = countVisibleTokens(cleanedCapture);
  const hidden = estimateHiddenTokens(cleanedCapture);
  const tokenEstimateDto = buildTokenEstimateDto(cleanedCapture, visible, hidden);
  const estimateDto = convertTokensToImpact(tokenEstimateDto);

  const record = createPromptRecord(cleanedCapture, estimateDto);
  await savePromptRecord(record);

  return record;
}
