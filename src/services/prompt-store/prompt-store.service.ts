/**
 * PromptStoreService: one row per estimated prompt in the SQLite `prompts` table, plus usage
 * queries for the popup and the app page.
 * Metrics only, never chat text (ADR 0009).
 *
 * Context: background
 * Docs: docs/modules.md#prompt-store-service
 */

import type { Database, SqlValue } from '@sqlite.org/sqlite-wasm';
import type { ChatCaptureDto, Provider, ThinkingEffort } from '../../dto/chat-capture.dto';
import type { PromptRecordDto } from '../../dto/prompt-record.dto';
import type { TokenEstimateDto } from '../../dto/token-estimate.dto';
import type { UsageSummaryDto } from '../../dto/usage-summary.dto';
import {
  CURRENT_ESTIMATION_VERSION,
  validateAndNormalizeRecord,
  validateAndNormalizeRecords,
  resolveStoredModelInfo,
} from './record-validator';
import { getDatabase, writeAndPersist } from './sqlite-database';

export {
  CURRENT_ESTIMATION_VERSION,
  validateAndNormalizeRecord,
  validateAndNormalizeRecords,
  resolveStoredModelInfo,
};

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
    tool_tokens      INTEGER NOT NULL DEFAULT 0,
    estimation_version TEXT  NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS prompts_captured_at ON prompts (captured_at);
`;

/**
 * Columns added after the first release: `ALTER TABLE` migrates databases created before them.
 * They are also in `CREATE_SCHEMA`, which only applies to new databases.
 */
const ADDED_COLUMNS: { name: string; definition: string }[] = [
  { name: 'tool_tokens', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'estimation_version', definition: "TEXT NOT NULL DEFAULT ''" },
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
    total_tokens, latency_ms, thinking_time_ms, approximate, energy_wh, water_ml, co2_grams,
    estimation_version
  ) VALUES (
    $id, $conversationUrl, $capturedAt, $provider,
    $modelName, $modelVersion, $thinkingEffort, $modelRawLabel,
    $input, $history, $output, $thinking, $tools, $overhead,
    $totalTokens, $latencyMs, $thinkingTimeMs, $approximate, $energyWh, $waterMl, $co2Grams,
    $estimationVersion
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
    COALESCE(SUM(overhead_tokens), 0) AS overhead,
    COALESCE(SUM(energy_wh), 0)       AS energyWh,
    COALESCE(SUM(water_ml), 0)        AS waterMl,
    COALESCE(SUM(co2_grams), 0)       AS co2Grams,
    MIN(captured_at)                  AS firstCapturedAt
  FROM prompts
  WHERE captured_at >= $sinceMs
`;

export function createPromptRecord(
  capture: ChatCaptureDto,
  estimate: TokenEstimateDto,
): PromptRecordDto {
  const candidate: PromptRecordDto = {
    id: crypto.randomUUID(),
    conversationUrl: capture.conversationUrl,
    ...estimate,
    estimationVersion: CURRENT_ESTIMATION_VERSION,
    isLegacy: false,
  };
  return validateAndNormalizeRecord(candidate) ?? candidate;
}

export async function savePromptRecord(record: PromptRecordDto): Promise<void> {
  const normalized = validateAndNormalizeRecord(record);
  if (!normalized) {
    throw new Error('Cannot save corrupt or invalid prompt record');
  }
  await writeAndPersist(applySchema, (db: Database) => {
    db.exec({
      sql: INSERT_PROMPT,
      bind: {
        $id: normalized.id,
        $conversationUrl: normalized.conversationUrl,
        $capturedAt: normalized.capturedAt,
        $provider: normalized.provider,
        $modelName: normalized.model.name,
        $modelVersion: normalized.model.version,
        $thinkingEffort: normalized.model.thinkingEffort,
        $modelRawLabel: normalized.model.rawLabel,
        $input: normalized.breakdown.input,
        $history: normalized.breakdown.history,
        $output: normalized.breakdown.output,
        $thinking: normalized.breakdown.thinking,
        $tools: normalized.breakdown.tools,
        $overhead: normalized.breakdown.overhead,
        $totalTokens: normalized.totalTokens,
        $latencyMs: normalized.timings.latencyMs,
        $thinkingTimeMs: normalized.timings.thinkingTimeMs,
        $approximate: normalized.approximate ? 1 : 0,
        $energyWh: normalized.impact.energyWh,
        $waterMl: normalized.impact.waterMl,
        $co2Grams: normalized.impact.co2Grams,
        $estimationVersion: normalized.estimationVersion ?? CURRENT_ESTIMATION_VERSION,
      },
    });
  });
}

/** `sinceMs` is epoch ms, inclusive. */
export async function getUsageSummary(sinceMs: number): Promise<UsageSummaryDto> {
  const db = await getDatabase(applySchema);
  const row = db.selectObject(SELECT_USAGE_SUMMARY, { $sinceMs: sinceMs }) ?? {};
  const num = (value: SqlValue | undefined): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return {
    sinceMs,
    queriedAtMs: Date.now(),
    // MIN() of an empty window is NULL.
    firstCapturedAt: row.firstCapturedAt == null ? null : num(row.firstCapturedAt),
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
    impact: {
      energyWh: num(row.energyWh),
      waterMl: num(row.waterMl),
      co2Grams: num(row.co2Grams),
    },
  };
}

const SELECT_PROMPT_RECORDS = `
  SELECT
    id,
    conversation_url AS conversationUrl,
    captured_at      AS capturedAt,
    provider,
    model_name       AS modelName,
    model_version    AS modelVersion,
    thinking_effort  AS thinkingEffort,
    model_raw_label  AS modelRawLabel,
    input_tokens     AS input,
    history_tokens   AS history,
    output_tokens    AS output,
    thinking_tokens  AS thinking,
    tool_tokens      AS tools,
    overhead_tokens  AS overhead,
    total_tokens     AS totalTokens,
    latency_ms       AS latencyMs,
    thinking_time_ms AS thinkingTimeMs,
    approximate,
    energy_wh          AS energyWh,
    water_ml           AS waterMl,
    co2_grams          AS co2Grams,
    estimation_version AS estimationVersion
  FROM prompts
  WHERE captured_at >= $sinceMs
  ORDER BY captured_at ASC
`;

const VALID_PROVIDERS = new Set<Provider>(['openai', 'anthropic', 'google']);
const VALID_EFFORTS = new Set<ThinkingEffort>([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'unknown',
]);

/**
 * Returns all valid stored prompt records with `capturedAt >= sinceMs`, ordered oldest to newest.
 * Each record is validated, model-resolved, and dynamically recomputed against the current
 * `config.json` via `validateAndNormalizeRecord`.
 */
export async function getPromptRecords(sinceMs = 0): Promise<PromptRecordDto[]> {
  const db = await getDatabase(applySchema);
  const rows = db.selectObjects(SELECT_PROMPT_RECORDS, { $sinceMs: sinceMs });
  const num = (value: SqlValue | undefined): number => Number(value ?? 0);
  const str = (value: SqlValue | undefined, fallback = ''): string =>
    typeof value === 'string' ? value : fallback;

  const rawRecords = rows.map((row) => {
    const rawProvider = str(row.provider, 'openai') as Provider;
    const provider: Provider = VALID_PROVIDERS.has(rawProvider) ? rawProvider : 'openai';
    const rawEffort = str(row.thinkingEffort, 'unknown') as ThinkingEffort;
    const thinkingEffort: ThinkingEffort = VALID_EFFORTS.has(rawEffort) ? rawEffort : 'unknown';

    return {
      id: str(row.id),
      conversationUrl: str(row.conversationUrl),
      capturedAt: num(row.capturedAt),
      provider,
      model: {
        name: str(row.modelName, 'unknown'),
        version: str(row.modelVersion, 'unknown'),
        thinkingEffort,
        rawLabel: str(row.modelRawLabel, 'unknown'),
      },
      breakdown: {
        input: num(row.input),
        history: num(row.history),
        output: num(row.output),
        thinking: num(row.thinking),
        tools: num(row.tools),
        overhead: num(row.overhead),
      },
      totalTokens: num(row.totalTokens),
      timings: {
        latencyMs: num(row.latencyMs),
        thinkingTimeMs: num(row.thinkingTimeMs),
      },
      approximate: num(row.approximate) !== 0,
      impact: {
        energyWh: num(row.energyWh),
        waterMl: num(row.waterMl),
        co2Grams: num(row.co2Grams),
      },
      estimationVersion: str(row.estimationVersion),
    };
  });

  return validateAndNormalizeRecords(rawRecords);
}

/** Deletes all stored prompt records and persists the empty database snapshot to IndexedDB. */
export async function clearPromptRecords(): Promise<void> {
  await writeAndPersist(applySchema, (db: Database) => {
    db.exec('DELETE FROM prompts');
  });
}

/**
 * Deletes only legacy records that lack a per-category token breakdown and cannot be recomputed.
 */
export async function clearLegacyPromptRecords(): Promise<void> {
  await writeAndPersist(applySchema, (db: Database) => {
    db.exec(`
      DELETE FROM prompts
      WHERE (input_tokens + history_tokens + output_tokens + thinking_tokens + tool_tokens + overhead_tokens) = 0
        AND total_tokens > 0
    `);
  });
}
