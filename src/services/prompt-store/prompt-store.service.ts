/**
 * PromptStoreService: one row per estimated prompt in the SQLite `prompts` table, plus usage
 * queries for the popup. Metrics only, never chat text (ADR 0009).
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

/** Runs on every start, so statements must stay idempotent. */
const CREATE_SCHEMA = `
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
    co2_grams        REAL    NOT NULL,
    tool_tokens      INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS prompts_captured_at ON prompts (captured_at);
`;

/** Columns added after the first release: `ALTER TABLE` for databases created before them. */
const ADDED_COLUMNS: { name: string; definition: string }[] = [
  { name: 'tool_tokens', definition: 'INTEGER NOT NULL DEFAULT 0' },
];

function applySchema(db: Database): void {
  db.exec(CREATE_SCHEMA);
  const existing = new Set(db.selectValues(`SELECT name FROM pragma_table_info('prompts')`));
  for (const column of ADDED_COLUMNS) {
    if (!existing.has(column.name)) {
      db.exec(`ALTER TABLE prompts ADD COLUMN ${column.name} ${column.definition}`);
    }
  }
}

const INSERT_PROMPT = `
  INSERT INTO prompts (
    id, conversation_url, captured_at, provider,
    model_name, model_version, thinking_effort, model_raw_label,
    input_tokens, history_tokens, output_tokens, thinking_tokens, tool_tokens, overhead_tokens,
    total_tokens, latency_ms, thinking_time_ms, approximate, energy_wh, water_ml, co2_grams
  ) VALUES (
    $id, $conversationUrl, $capturedAt, $provider,
    $modelName, $modelVersion, $thinkingEffort, $modelRawLabel,
    $input, $history, $output, $thinking, $tools, $overhead,
    $totalTokens, $latencyMs, $thinkingTimeMs, $approximate, $energyWh, $waterMl, $co2Grams
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
    COALESCE(SUM(tool_tokens), 0)     AS tools,
    COALESCE(SUM(overhead_tokens), 0) AS overhead
  FROM prompts
  WHERE captured_at >= $sinceMs
`;

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

export async function savePromptRecord(record: PromptRecordDto): Promise<void> {
  await writeAndPersist(applySchema, (db: Database) => {
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
        $tools: record.breakdown.tools,
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

/** `sinceMs` is epoch ms, inclusive. */
export async function getUsageSummary(sinceMs: number): Promise<UsageSummaryDto> {
  const db = await getDatabase(applySchema);
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
      tools: num(row.tools),
      overhead: num(row.overhead),
    },
  };
}
