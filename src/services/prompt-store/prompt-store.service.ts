/**
 * PromptStoreService: saves every estimated prompt as one row in the SQLite `prompts` table and
 * answers usage queries for the popup. Metrics only, no chat text.
 *
 * API: `createPromptRecord(capture, estimate)`, `savePromptRecord(record)`,
 * `getUsageSummary(sinceMs)`. Persistence details are in `sqlite-database.ts`.
 *
 * Context: background
 * Docs: docs/modules.md#prompt-store-service
 */

import type { Database, SqlValue } from '@sqlite.org/sqlite-wasm';
import type { ChatCaptureDto } from '../../dto/chat-capture.dto';
import type { PromptRecordDto } from '../../dto/prompt-record.dto';
import type { TokenEstimateDto } from '../../dto/token-estimate.dto';
import type { UsageSummaryDto } from '../../dto/usage-summary.dto';
import { getDatabase, writeAndPersist } from './sqlite-database';

/** Schema, run on every start. Statements must stay idempotent. */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS prompts (
    id               TEXT PRIMARY KEY,
    conversation_url TEXT    NOT NULL,
    captured_at      INTEGER NOT NULL,
    provider         TEXT    NOT NULL,
    model_name       TEXT    NOT NULL,
    model_version    TEXT    NOT NULL,
    thinking_effort  TEXT    NOT NULL,
    model_raw_label  TEXT    NOT NULL,
    input_tokens     INTEGER NOT NULL,
    history_tokens   INTEGER NOT NULL,
    output_tokens    INTEGER NOT NULL,
    thinking_tokens  INTEGER NOT NULL,
    overhead_tokens  INTEGER NOT NULL,
    total_tokens     INTEGER NOT NULL,
    latency_ms       INTEGER NOT NULL,
    thinking_time_ms INTEGER NOT NULL,
    approximate      INTEGER NOT NULL,
    energy_wh        REAL    NOT NULL,
    water_ml         REAL    NOT NULL,
    co2_grams        REAL    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS prompts_captured_at ON prompts (captured_at);
`;

const INSERT_PROMPT = `
  INSERT INTO prompts (
    id, conversation_url, captured_at, provider,
    model_name, model_version, thinking_effort, model_raw_label,
    input_tokens, history_tokens, output_tokens, thinking_tokens, overhead_tokens, total_tokens,
    latency_ms, thinking_time_ms, approximate, energy_wh, water_ml, co2_grams
  ) VALUES (
    $id, $conversationUrl, $capturedAt, $provider,
    $modelName, $modelVersion, $thinkingEffort, $modelRawLabel,
    $input, $history, $output, $thinking, $overhead, $totalTokens,
    $latencyMs, $thinkingTimeMs, $approximate, $energyWh, $waterMl, $co2Grams
  )
`;

const SELECT_USAGE_SUMMARY = `
  SELECT
    COUNT(*)                          AS promptCount,
    COALESCE(SUM(total_tokens), 0)    AS totalTokens,
    COALESCE(SUM(input_tokens), 0)    AS input,
    COALESCE(SUM(history_tokens), 0)  AS history,
    COALESCE(SUM(output_tokens), 0)   AS output,
    COALESCE(SUM(thinking_tokens), 0) AS thinking,
    COALESCE(SUM(overhead_tokens), 0) AS overhead
  FROM prompts
  WHERE captured_at >= $sinceMs
`;

/**
 * Builds the row for one estimated prompt: the estimate plus a new UUID and the conversation link.
 */
export function createPromptRecord(
  capture: ChatCaptureDto,
  estimate: TokenEstimateDto,
): PromptRecordDto {
  return {
    id: crypto.randomUUID(),
    conversationUrl: capture.conversationUrl,
    ...estimate,
  };
}

/** Inserts `record` into the `prompts` table and persists the database. */
export async function savePromptRecord(record: PromptRecordDto): Promise<void> {
  await writeAndPersist(SCHEMA, (db: Database) => {
    db.exec({
      sql: INSERT_PROMPT,
      bind: {
        $id: record.id,
        $conversationUrl: record.conversationUrl,
        $capturedAt: record.capturedAt,
        $provider: record.provider,
        $modelName: record.model.name,
        $modelVersion: record.model.version,
        $thinkingEffort: record.model.thinkingEffort,
        $modelRawLabel: record.model.rawLabel,
        $input: record.breakdown.input,
        $history: record.breakdown.history,
        $output: record.breakdown.output,
        $thinking: record.breakdown.thinking,
        $overhead: record.breakdown.overhead,
        $totalTokens: record.totalTokens,
        $latencyMs: record.timings.latencyMs,
        $thinkingTimeMs: record.timings.thinkingTimeMs,
        $approximate: record.approximate ? 1 : 0,
        $energyWh: record.impact.energyWh,
        $waterMl: record.impact.waterMl,
        $co2Grams: record.impact.co2Grams,
      },
    });
  });
}

/** Sums the token usage of all saved prompts captured at or after `sinceMs` (epoch ms). */
export async function getUsageSummary(sinceMs: number): Promise<UsageSummaryDto> {
  const db = await getDatabase(SCHEMA);
  const row = db.selectObject(SELECT_USAGE_SUMMARY, { $sinceMs: sinceMs }) ?? {};
  const num = (value: SqlValue | undefined): number => Number(value ?? 0);

  return {
    sinceMs,
    promptCount: num(row.promptCount),
    totalTokens: num(row.totalTokens),
    breakdown: {
      input: num(row.input),
      history: num(row.history),
      output: num(row.output),
      thinking: num(row.thinking),
      overhead: num(row.overhead),
    },
  };
}
