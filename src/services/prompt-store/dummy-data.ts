/**
 * DummyData: generates fake prompt records for development (UI testing with a full history).
 * Records are dated before `beforeMs`, so they become the oldest rows. Impact is left at 0 and
 * recomputed by `validateAndNormalizeRecord` when the records are saved.
 *
 * Context: background
 * Docs: docs/modules.md#prompt-store-service
 */

import { estimation } from '../../config/config.json';
import type { ModelInfo, Provider, ThinkingEffort } from '../../dto/chat-capture.dto';
import type { PromptRecordDto } from '../../dto/prompt-record.dto';

interface DummyModel {
  provider: Provider;
  model: ModelInfo;
}

// Mix of reasoning and fast models from every provider, so the model charts have spread.
const MODELS: DummyModel[] = [
  m('openai', 'gpt-astra', '6', 'high', 'GPT-6 Astra'),
  m('openai', 'gpt-luna', '6', 'none', 'GPT-6 Luna'),
  m('openai', 'gpt-sol', '6', 'medium', 'GPT-6 Sol'),
  m('anthropic', 'claude-opus', '4.5', 'high', 'Opus 4.5'),
  m('anthropic', 'claude-sonnet', '4.5', 'medium', 'Sonnet 4.5'),
  m('anthropic', 'claude-haiku', '4.5', 'none', 'Haiku 4.5'),
  m('google', 'gemini-pro', '3', 'medium', 'Gemini 3 Pro'),
  m('google', 'gemini-flash', '3', 'none', 'Gemini 3 Flash'),
];

const CONVERSATION_URL: Record<Provider, (id: string) => string> = {
  openai: (id) => `https://chatgpt.com/c/${id}`,
  anthropic: (id) => `https://claude.ai/chat/${id}`,
  google: (id) => `https://gemini.google.com/app/${id.replace(/-/g, '').slice(0, 16)}`,
};

/** Marks fake rows, so seeding runs only once and they can be found (and deleted) again. */
export const DUMMY_ID_PREFIX = 'dummy-';
/** About 1,200 prompts. */
export const DUMMY_TARGET_TOKENS = 12_000_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const SPAN_DAYS = 45;

function m(
  provider: Provider,
  name: string,
  version: string,
  thinkingEffort: ThinkingEffort,
  rawLabel: string,
): DummyModel {
  return { provider, model: { name, version, thinkingEffort, rawLabel } };
}

function rand(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function profileOf(provider: Provider, name: string) {
  const families = estimation.models[provider].families as Record<
    string,
    { systemPromptTokens: number; tokensPerMsThinking: number }
  >;
  return families[name] ?? estimation.models[provider].default;
}

/**
 * Builds conversations until their total reaches `targetTokens`, spread over the `SPAN_DAYS` days
 * before `beforeMs`. Turns of one conversation are minutes apart and re-send the earlier turns as
 * history, like the real chat apps.
 */
export function generateDummyRecords(targetTokens: number, beforeMs: number): PromptRecordDto[] {
  const conversations: PromptRecordDto[][] = [];
  let total = 0;

  while (total < targetTokens) {
    const { provider, model } = MODELS[rand(0, MODELS.length - 1)]!;
    const profile = profileOf(provider, model.name);
    const url = CONVERSATION_URL[provider](crypto.randomUUID());
    const turns: PromptRecordDto[] = [];
    let history = 0;

    for (let turn = 0, count = rand(1, 7); turn < count && total < targetTokens; turn++) {
      const input = rand(20, 900);
      const output = rand(150, 2200);
      const thinking = model.thinkingEffort === 'none' ? 0 : rand(300, 6000);
      const tools = Math.random() < 0.2 ? rand(800, 4000) : 0;
      const overhead = profile.systemPromptTokens;
      const totalTokens = input + history + output + thinking + tools + overhead;
      const thinkingTimeMs = Math.round(thinking / profile.tokensPerMsThinking);

      turns.push({
        id: `${DUMMY_ID_PREFIX}${crypto.randomUUID()}`,
        conversationUrl: url,
        capturedAt: 0, // set below, once the conversation's start is known
        provider,
        model: { ...model },
        totalTokens,
        breakdown: { input, history, output, thinking, tools, overhead },
        impact: { energyWh: 0, waterMl: 0, co2Grams: 0 },
        timings: { latencyMs: thinkingTimeMs + rand(1500, 4000) + output * 12, thinkingTimeMs },
        approximate: true,
      });
      total += totalTokens;
      history += input + output;
    }
    conversations.push(turns);
  }

  const end = beforeMs - 60_000;
  const starts = conversations
    .map(() => end - Math.random() * SPAN_DAYS * DAY_MS)
    .sort((a, b) => a - b);

  return conversations.flatMap((turns, index) => {
    // Pull the start back so the last turn still lands before `end`.
    let time = Math.min(starts[index]!, end - turns.length * 10 * 60_000);
    return turns.map((record) => {
      time += rand(1, 10) * 60_000;
      return { ...record, capturedAt: Math.round(time) };
    });
  });
}
