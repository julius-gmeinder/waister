/**
 * Orchestrates one captured prompt: count tokens, estimate hidden tokens, save to the database.
 *
 * Context: background
 * Docs: docs/modules.md#handlers, docs/pipeline.md
 */

import type { ChatCaptureDto } from '../dto/chat-capture.dto';
import type { PromptRecordDto } from '../dto/prompt-record.dto';
import {
  createPromptRecord,
  savePromptRecord,
} from '../services/prompt-store/prompt-store.service';
import {
  buildTokenEstimateDto,
  estimateHiddenTokens,
} from '../services/estimation/estimation.service';
import { countVisibleTokens } from '../services/tokenizer/tokenizer.service';

export function normalizeCaptureDto(captureDto: ChatCaptureDto): ChatCaptureDto {
  return {
    provider: captureDto.provider,
    model: {
      name: captureDto.model.name,
      version: captureDto.model.version,
      thinkingEffort: captureDto.model.thinkingEffort,
      rawLabel: captureDto.model.rawLabel,
    },
    userInput: captureDto.userInput.trim(),
    userAttachments: [...(captureDto.userAttachments ?? [])],
    response: captureDto.response.trim(),
    artifactText: (captureDto.artifactText ?? '').trim(),
    toolCalls: [...(captureDto.toolCalls ?? [])],
    chatHistory: captureDto.chatHistory.map((turn) => ({
      role: turn.role,
      text: turn.text.trim(),
      ...(turn.attachments?.length ? { attachments: [...turn.attachments] } : {}),
    })),
    latencyMs: Math.max(0, captureDto.latencyMs),
    thinkingTimeMs: Math.max(0, captureDto.thinkingTimeMs),
    capturedAt: captureDto.capturedAt,
    conversationUrl: captureDto.conversationUrl,
  };
}

export async function handleEstimation(captureDto: ChatCaptureDto): Promise<PromptRecordDto> {
  const cleanedCapture = normalizeCaptureDto(captureDto);
  const visible = countVisibleTokens(cleanedCapture);
  const hidden = estimateHiddenTokens(cleanedCapture);
  const estimateDto = buildTokenEstimateDto(cleanedCapture, visible, hidden);

  const record = createPromptRecord(cleanedCapture, estimateDto);
  await savePromptRecord(record);

  return record;
}
