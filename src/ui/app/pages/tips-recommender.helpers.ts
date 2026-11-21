/**
 * TipsRecommender: pure recommendation logic that inspects validated recent prompt records
 * (7d first, then 30d) using the Analytics normalization and weighting pipeline to pick the top
 * 1–2 personalized tips, plus lightweight localStorage persistence for adopted habit checkmarks.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { TokenEnergyCategory } from '../../../config/config.types';
import type { PromptRecordDto } from '../../../dto/prompt-record.dto';
import { DAY_MS } from '../../timeframe.helpers';
import {
  buildCategoryBreakdown,
  filterRecordsByWindow,
  getModelBaseEnergyWhPer1M,
  LOW_SAMPLE_PROMPT_THRESHOLD,
  normalizeAnalyticsRecord,
} from './analytics.helpers';
import {
  getTipById,
  isTipId,
  TIPS_CATALOG,
  type TipId,
  type TipItem,
} from './tips-catalog.helpers';

export const ADOPTED_TIPS_STORAGE_KEY = 'waister.tips.adoptedTipIds';

/** Heavy/flagship model threshold aligned with Analytics `buildEcoInsight`. */
const HEAVY_MODEL_WH_PER_1M = 1500;
const SHORT_TURN_MAX_INPUT_TOKENS = 60;
const SHORT_TURN_MAX_OUTPUT_TOKENS = 250;
const LONG_REPLY_AVG_OUTPUT_TOKENS = 900;
const TOKENS_TO_WORDS_RATIO = 0.75;
const MAX_FEATURED_TIPS = 2;

const STARTER_TIP_ORDER: readonly TipId[] = [
  'start-fresh-chat',
  'match-model-to-task',
  'save-deep-thinking',
  'ask-for-length-and-format',
];

export interface RecommendedTip {
  tip: TipItem;
  /** Plain-English 1-line data-backed reason, or `null` in starter fallback mode. */
  reason: string | null;
}

export interface TipsRecommendationResult {
  sectionTitle: string;
  isStarterFallback: boolean;
  windowLabel: 'last 7 days' | 'last 30 days' | null;
  sampleCount: number;
  items: RecommendedTip[];
}

interface ScoredCandidate {
  tipId: TipId;
  score: number;
  reason: string;
}

/** Reads persisted adopted tip IDs from localStorage (mirrors Analytics preference storage). */
export function readAdoptedTipIds(): TipId[] {
  try {
    const raw = window.localStorage.getItem(ADOPTED_TIPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<TipId>();
    const valid: TipId[] = [];
    for (const item of parsed) {
      if (isTipId(item) && !seen.has(item)) {
        seen.add(item);
        valid.push(item);
      }
    }
    return valid;
  } catch {
    return [];
  }
}

/** Persists adopted tip IDs to localStorage safely. */
export function writeAdoptedTipIds(ids: readonly TipId[]): void {
  try {
    window.localStorage.setItem(ADOPTED_TIPS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage errors in restricted contexts.
  }
}

function getSegmentShare(
  segments: readonly { category: TokenEnergyCategory; percentage: number }[],
  category: TokenEnergyCategory,
): number {
  const seg = segments.find((s) => s.category === category);
  return seg ? seg.percentage / 100 : 0;
}

function formatPct(share: number): string {
  return `${Math.max(1, Math.round(share * 100))}%`;
}

function pickStarterItems(
  adoptedSet: ReadonlySet<TipId>,
  reasonBuilder: (tip: TipItem) => string | null,
): RecommendedTip[] {
  const orderedIds: TipId[] = [
    ...STARTER_TIP_ORDER,
    ...TIPS_CATALOG.map((t) => t.id).filter((id) => !STARTER_TIP_ORDER.includes(id)),
  ];

  const unadopted = orderedIds.filter((id) => !adoptedSet.has(id));
  const pool = unadopted.length > 0 ? unadopted : orderedIds;

  return pool.slice(0, MAX_FEATURED_TIPS).map((id) => {
    const tip = getTipById(id);
    return { tip, reason: reasonBuilder(tip) };
  });
}

/**
 * Selects the top 1–2 personalized tips from recent usage (7d, widening to 30d if 7d has fewer
 * than 3 messages). Falls back cleanly to top starter tips with no fake stats when usage is empty
 * or sparse (< 3 messages).
 */
export function recommendTips(
  allRecords: readonly PromptRecordDto[] | null | undefined,
  adoptedTipIds: readonly TipId[] = [],
  nowMs: number = Date.now(),
): TipsRecommendationResult {
  const adoptedSet = new Set<TipId>(adoptedTipIds);

  const normalized: PromptRecordDto[] = [];
  if (Array.isArray(allRecords)) {
    for (const candidate of allRecords) {
      const valid = normalizeAnalyticsRecord(candidate);
      if (valid && !valid.isLegacy && valid.totalTokens > 0) {
        normalized.push(valid);
      }
    }
  }

  const last7d = filterRecordsByWindow(normalized, nowMs - 7 * DAY_MS);
  const last30d = filterRecordsByWindow(normalized, nowMs - 30 * DAY_MS);

  const use7d = last7d.length >= LOW_SAMPLE_PROMPT_THRESHOLD;
  const activeRecords = use7d ? last7d : last30d;
  const windowLabel: 'last 7 days' | 'last 30 days' = use7d ? 'last 7 days' : 'last 30 days';

  if (activeRecords.length < LOW_SAMPLE_PROMPT_THRESHOLD) {
    return {
      sectionTitle: 'Start here: highest-impact habits',
      isStarterFallback: true,
      windowLabel: null,
      sampleCount: activeRecords.length,
      items: pickStarterItems(adoptedSet, () => null),
    };
  }

  const breakdown = buildCategoryBreakdown(activeRecords, 'power', false);
  const prefix = `Based on your ${windowLabel}`;

  const historyEnergyShare = getSegmentShare(breakdown.segments, 'history');
  const thinkingEnergyShare = getSegmentShare(breakdown.segments, 'thinking');
  const outputEnergyShare = getSegmentShare(breakdown.segments, 'output');
  const inputEnergyShare = getSegmentShare(breakdown.segments, 'input');
  const toolsEnergyShare = getSegmentShare(breakdown.segments, 'tools');
  const systemPromptEnergyShare = getSegmentShare(breakdown.segments, 'systemPrompt');

  const historySegment = breakdown.segments.find((s) => s.category === 'history');
  const rawHistoryShare =
    breakdown.totalRawTokens > 0 ? (historySegment?.rawTokens ?? 0) / breakdown.totalRawTokens : 0;

  let totalEnergyWh = 0;
  let heavyModelEnergyWh = 0;
  let totalOutputTokens = 0;
  let shortTurnCount = 0;

  for (const record of activeRecords) {
    const energyWh = Math.max(0, record.impact.energyWh);
    totalEnergyWh += energyWh;
    if (getModelBaseEnergyWhPer1M(record.provider, record.model) >= HEAVY_MODEL_WH_PER_1M) {
      heavyModelEnergyWh += energyWh;
    }
    totalOutputTokens += Math.max(0, record.breakdown.output);
    if (
      record.breakdown.input <= SHORT_TURN_MAX_INPUT_TOKENS &&
      record.breakdown.output <= SHORT_TURN_MAX_OUTPUT_TOKENS
    ) {
      shortTurnCount += 1;
    }
  }

  const heavyModelShare = totalEnergyWh > 0 ? heavyModelEnergyWh / totalEnergyWh : 0;
  const avgOutputTokens = totalOutputTokens / activeRecords.length;
  const shortTurnShare = shortTurnCount / activeRecords.length;

  const candidates: ScoredCandidate[] = [];

  if (historyEnergyShare >= 0.14) {
    candidates.push({
      tipId: 'start-fresh-chat',
      score: historyEnergyShare / 0.14,
      reason: `${prefix} · Chat memory drove ${formatPct(historyEnergyShare)} of your energy`,
    });
  } else if (rawHistoryShare >= 0.35) {
    candidates.push({
      tipId: 'start-fresh-chat',
      score: rawHistoryShare / 0.35,
      reason: `${prefix} · Earlier chat memory made up ${formatPct(rawHistoryShare)} of your threads`,
    });
  }

  if (heavyModelShare >= 0.35) {
    candidates.push({
      tipId: 'match-model-to-task',
      score: heavyModelShare / 0.35,
      reason: `${prefix} · Heavy models drove ${formatPct(heavyModelShare)} of your energy`,
    });
  }

  if (thinkingEnergyShare >= 0.18) {
    candidates.push({
      tipId: 'save-deep-thinking',
      score: thinkingEnergyShare / 0.18,
      reason: `${prefix} · AI reasoning drove ${formatPct(thinkingEnergyShare)} of your energy`,
    });
  }

  if (outputEnergyShare >= 0.45) {
    candidates.push({
      tipId: 'ask-for-length-and-format',
      score: outputEnergyShare / 0.45,
      reason: `${prefix} · AI replies drove ${formatPct(outputEnergyShare)} of your energy`,
    });
  } else if (avgOutputTokens >= LONG_REPLY_AVG_OUTPUT_TOKENS) {
    const approxWords = Math.round((avgOutputTokens * TOKENS_TO_WORDS_RATIO) / 50) * 50;
    candidates.push({
      tipId: 'ask-for-length-and-format',
      score: avgOutputTokens / LONG_REPLY_AVG_OUTPUT_TOKENS,
      reason: `${prefix} · AI replies averaged around ${approxWords.toLocaleString('en-US')} words each`,
    });
  }

  if (systemPromptEnergyShare >= 0.12) {
    candidates.push({
      tipId: 'bundle-related-questions',
      score: systemPromptEnergyShare / 0.12,
      reason: `${prefix} · Repeated app setup drove ${formatPct(systemPromptEnergyShare)} of your energy`,
    });
  } else if (shortTurnShare >= 0.6) {
    candidates.push({
      tipId: 'bundle-related-questions',
      score: shortTurnShare / 0.6,
      reason: `${prefix} · ${formatPct(shortTurnShare)} of your messages were quick back-and-forth turns`,
    });
  }

  if (inputEnergyShare >= 0.22) {
    candidates.push({
      tipId: 'share-only-needed-section',
      score: inputEnergyShare / 0.22,
      reason: `${prefix} · Your messages and uploads drove ${formatPct(inputEnergyShare)} of your energy`,
    });
  }

  if (toolsEnergyShare >= 0.1) {
    candidates.push({
      tipId: 'use-regular-search',
      score: toolsEnergyShare / 0.1,
      reason: `${prefix} · Search & tools drove ${formatPct(toolsEnergyShare)} of your energy`,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const uniqueCandidates: ScoredCandidate[] = [];
  const seenIds = new Set<TipId>();
  for (const candidate of candidates) {
    if (!seenIds.has(candidate.tipId)) {
      seenIds.add(candidate.tipId);
      uniqueCandidates.push(candidate);
    }
  }

  const unadoptedTriggered = uniqueCandidates.filter((c) => !adoptedSet.has(c.tipId));

  let selected: RecommendedTip[];
  if (unadoptedTriggered.length > 0) {
    selected = unadoptedTriggered.slice(0, MAX_FEATURED_TIPS).map((c) => ({
      tip: getTipById(c.tipId),
      reason: c.reason,
    }));
  } else {
    const unadoptedFallback = pickStarterItems(
      adoptedSet,
      () => `${prefix} · Your usage looks balanced—here is a high-impact habit to keep`,
    );
    const allAdopted = adoptedSet.size >= TIPS_CATALOG.length;
    if (allAdopted && uniqueCandidates.length > 0) {
      selected = uniqueCandidates.slice(0, MAX_FEATURED_TIPS).map((c) => ({
        tip: getTipById(c.tipId),
        reason: c.reason,
      }));
    } else {
      selected = unadoptedFallback;
    }
  }

  return {
    sectionTitle: 'Recommended for you',
    isStarterFallback: false,
    windowLabel,
    sampleCount: activeRecords.length,
    items: selected,
  };
}
