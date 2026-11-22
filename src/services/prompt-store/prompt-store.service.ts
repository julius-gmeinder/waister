/**
 * PromptStoreService: one row per estimated prompt in the SQLite `prompts` table, plus usage
 * and history queries for the popup and the app page.
 * Metrics only, never chat text (ADR 0009).
 *
 * Context: background
 * Docs: docs/modules.md#prompt-store-service
 */

import type { Database, SqlValue } from '@sqlite.org/sqlite-wasm';
import type { ChatCaptureDto, Provider, ThinkingEffort } from '../../dto/chat-capture.dto';
import type {
  HistorySort,
  PromptHistoryDto,
  PromptHistoryQuery,
} from '../../dto/prompt-history.dto';
import type { PromptRecordDto } from '../../dto/prompt-record.dto';
import type { TokenEstimateDto } from '../../dto/token-estimate.dto';
import type { UsageSummaryDto } from '../../dto/usage-summary.dto';
import {
  CURRENT_ESTIMATION_VERSION,
  validateAndNormalizeRecord,
  validateAndNormalizeRecords,
  resolveStoredModelInfo,
} from './record-validator';
import { DUMMY_ID_PREFIX, DUMMY_TARGET_TOKENS, generateDummyRecords } from './dummy-data';
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

/** Followed by a WHERE clause from `whereClause`, so the sums cover the same rows as a page. */
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
`;

/** Every column of one `PromptRecordDto`, aliased to the names `toPromptRecord` reads. */
const SELECT_PROMPT_RECORDS = `
  SELECT
    id, conversation_url AS conversationUrl, captured_at AS capturedAt, provider,
    model_name AS modelName, model_version AS modelVersion,
    thinking_effort AS thinkingEffort, model_raw_label AS modelRawLabel,
    input_tokens AS input, history_tokens AS history, output_tokens AS output,
    thinking_tokens AS thinking, tool_tokens AS tools, overhead_tokens AS overhead,
    total_tokens AS totalTokens, latency_ms AS latencyMs, thinking_time_ms AS thinkingTimeMs,
    approximate, energy_wh AS energyWh, water_ml AS waterMl, co2_grams AS co2Grams,
    estimation_version AS estimationVersion
  FROM prompts
`;

/**
 * Whitelist instead of interpolating the requested sort. Ties fall back to newest first and then
 * the id, so paging with OFFSET never skips or repeats a row between two pages.
 */
const HISTORY_ORDER: Record<HistorySort, string> = {
  newest: 'captured_at DESC, id',
  oldest: 'captured_at ASC, id',
  tokens: 'total_tokens DESC, captured_at DESC, id',
  energy: 'energy_wh DESC, captured_at DESC, id',
};

/** Shared WHERE clause of the summary and the history page. Providers are bound, never inlined. */
function whereClause(
  sinceMs: number,
  providers: readonly Provider[],
): { sql: string; bind: Record<string, SqlValue> } {
  const bind: Record<string, SqlValue> = { $sinceMs: sinceMs };
  let sql = 'WHERE captured_at >= $sinceMs';
  if (providers.length > 0) {
    const names = providers.map((provider, index) => {
      bind[`$provider${index}`] = provider;
      return `$provider${index}`;
    });
    sql += ` AND provider IN (${names.join(', ')})`;
  }
  return { sql, bind };
}

function num(value: SqlValue | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: SqlValue | undefined): string {
  return value == null ? '' : String(value);
}

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
    db.exec({ sql: INSERT_PROMPT, bind: bindRecord(normalized) });
  });
}

/**
 * Development only (`npm run dummy`): inserts about `targetTokens` of fake prompts dated before
 * the oldest stored row, in one transaction with one snapshot. Tops up: dummy rows that already
 * exist count toward the target, so a rerun adds only what is missing (or nothing). Returns how many rows and tokens were added.
 */
export async function seedDummyPromptRecords(
  targetTokens = DUMMY_TARGET_TOKENS,
): Promise<{ records: number; totalTokens: number }> {
  return writeAndPersist(applySchema, (db: Database) => {
    const existing = db.selectValue(
      'SELECT COALESCE(SUM(total_tokens), 0) FROM prompts WHERE id LIKE $prefix',
      { $prefix: `${DUMMY_ID_PREFIX}%` },
    );
    const missing = targetTokens - num(existing);
    if (missing <= 0) return { records: 0, totalTokens: 0 };
    const oldest = db.selectValue('SELECT MIN(captured_at) FROM prompts');
    const records = validateAndNormalizeRecords(
      generateDummyRecords(missing, oldest == null ? Date.now() : num(oldest)),
    );
    db.transaction(() => {
      for (const record of records) db.exec({ sql: INSERT_PROMPT, bind: bindRecord(record) });
    });
    return {
      records: records.length,
      totalTokens: records.reduce((sum, record) => sum + record.totalTokens, 0),
    };
  });
}

/** Named parameters of `INSERT_PROMPT` for one already normalized record. */
function bindRecord(normalized: PromptRecordDto): Record<string, SqlValue> {
  return {
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
  };
}

/** `sinceMs` is epoch ms, inclusive. */
export async function getUsageSummary(sinceMs: number): Promise<UsageSummaryDto> {
  const db = await getDatabase(applySchema);
  return summarize(db, sinceMs, []);
}

/** One page of rows plus the totals of every row matching the same filter (both in one read). */
export async function getPromptHistory(query: PromptHistoryQuery): Promise<PromptHistoryDto> {
  const db = await getDatabase(applySchema);
  const where = whereClause(query.sinceMs, query.providers);
  const order = HISTORY_ORDER[query.sort] ?? HISTORY_ORDER.newest;
  const rows = db.selectObjects(
    `${SELECT_PROMPT_RECORDS} ${where.sql} ORDER BY ${order} LIMIT $limit OFFSET $offset`,
    {
      ...where.bind,
      $limit: Math.max(1, Math.floor(query.limit)),
      $offset: Math.max(0, Math.floor(query.offset)),
    },
  );

  return {
    records: rows.map((row) => toPromptRecord(row)),
    summary: summarize(db, query.sinceMs, query.providers),
  };
}

function summarize(db: Database, sinceMs: number, providers: readonly Provider[]): UsageSummaryDto {
  const where = whereClause(sinceMs, providers);
  const row = db.selectObject(`${SELECT_USAGE_SUMMARY} ${where.sql}`, where.bind) ?? {};

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

/** Inverse of the INSERT binding in `savePromptRecord`. */
function toPromptRecord(
  row: Record<string, SqlValue>,
  parseNum: (value: SqlValue | undefined) => number = num,
): PromptRecordDto {
  const rawProvider = str(row.provider) as Provider;
  const provider: Provider = VALID_PROVIDERS.has(rawProvider) ? rawProvider : 'openai';
  const rawEffort = str(row.thinkingEffort) as ThinkingEffort;
  const thinkingEffort: ThinkingEffort = VALID_EFFORTS.has(rawEffort) ? rawEffort : 'unknown';

  return {
    id: str(row.id),
    conversationUrl: str(row.conversationUrl),
    capturedAt: parseNum(row.capturedAt),
    provider,
    model: {
      name: str(row.modelName) || 'unknown',
      version: str(row.modelVersion) || 'unknown',
      thinkingEffort,
      rawLabel: str(row.modelRawLabel) || 'unknown',
    },
    totalTokens: parseNum(row.totalTokens),
    breakdown: {
      input: parseNum(row.input),
      history: parseNum(row.history),
      output: parseNum(row.output),
      thinking: parseNum(row.thinking),
      tools: parseNum(row.tools),
      overhead: parseNum(row.overhead),
    },
    impact: {
      energyWh: parseNum(row.energyWh),
      waterMl: parseNum(row.waterMl),
      co2Grams: parseNum(row.co2Grams),
    },
    timings: {
      latencyMs: parseNum(row.latencyMs),
      thinkingTimeMs: parseNum(row.thinkingTimeMs),
    },
    approximate: parseNum(row.approximate) !== 0,
    estimationVersion: str(row.estimationVersion),
  };
}

/**
 * Returns all valid stored prompt records with `capturedAt >= sinceMs`, ordered oldest to newest.
 * Each record is validated, model-resolved, and dynamically recomputed against the current
 * `config.json` via `validateAndNormalizeRecord`.
 */
export async function getPromptRecords(sinceMs = 0): Promise<PromptRecordDto[]> {
  const db = await getDatabase(applySchema);
  const rows = db.selectObjects(
    `${SELECT_PROMPT_RECORDS} WHERE captured_at >= $sinceMs ORDER BY captured_at ASC`,
    { $sinceMs: sinceMs },
  );
  const rawNum = (value: SqlValue | undefined): number => Number(value ?? 0);
  return validateAndNormalizeRecords(rows.map((row) => toPromptRecord(row, rawNum)));
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
