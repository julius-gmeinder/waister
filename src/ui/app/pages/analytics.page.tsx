/**
 * AnalyticsPage: clean, plain-language analytics view with progressive technical disclosure,
 * two-group stacked energy breakdown, top-5 + Other model donut, Fair Model Comparison
 * (`Equal Length` per 1,000 words vs `Per Message`), Chat Memory Over Time chart, and
 * personalized Eco-Insight banner with JSON/CSV export and history reset.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import {
  AlertTriangle,
  Brain,
  Coins,
  Download,
  Droplet,
  Factory,
  History,
  Layers,
  Leaf,
  MessageSquare,
  MessageSquareText,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { TokenEnergyCategory } from '../../../config/config.types';
import type { PromptRecordDto } from '../../../dto/prompt-record.dto';
import { ChartCard } from '../../components/chart-card.component';
import { PageTitle } from '../../components/page-title.component';
import { formatCount } from '../../format.helpers';
import type { PromptRecordsState } from '../../usage-api';
import {
  aggregateAnalytics,
  ANALYTICS_METRIC_TABS,
  ANALYTICS_TIMEFRAMES,
  formatCompactTokens,
  formatRecordsAsCsv,
  formatRecordsAsJson,
  type AnalyticsKpiCardViewModel,
  type AnalyticsMetricTab,
  type AnalyticsTimeframe,
  type CategoryBreakdownSegment,
  type CategoryBreakdownViewModel,
  type EcoInsightViewModel,
  type HistoryTimeSeriesViewModel,
  type ModelDonutViewModel,
  type ModelEfficiencyMode,
  type ModelEfficiencyViewModel,
  type ModelUsageMode,
} from './analytics.helpers';

interface AnalyticsPageProps {
  records?: PromptRecordsState;
  onResetHistory?: () => Promise<boolean>;
  onClearLegacyHistory?: () => Promise<boolean>;
}

const TECHNICAL_DETAILS_STORAGE_KEY = 'waister.analytics.showTechnicalDetails';

function readTechnicalDetailsPreference(): boolean {
  try {
    return window.localStorage.getItem(TECHNICAL_DETAILS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

const METRIC_TAB_ICONS: Record<AnalyticsMetricTab, LucideIcon> = {
  all: Layers,
  power: Zap,
  water: Droplet,
  co2: Factory,
  tokens: Coins,
};

const CATEGORY_ICONS: Record<TokenEnergyCategory, LucideIcon> = {
  output: MessageSquareText,
  thinking: Brain,
  history: History,
  input: MessageSquare,
  tools: Wrench,
  systemPrompt: Settings2,
};

function triggerFileDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function KpiCard({ card }: { card: AnalyticsKpiCardViewModel }) {
  return (
    <article className={`analytics-kpi analytics-kpi--${card.tone}`}>
      <div className="analytics-kpi-top">
        <span className="analytics-kpi-label">{card.label}</span>
        {card.deltaText && (
          <span
            className={
              card.deltaTrend
                ? `analytics-kpi-delta analytics-kpi-delta--${card.deltaTrend}`
                : 'analytics-kpi-delta'
            }
          >
            {card.deltaText}
          </span>
        )}
      </div>
      <div className="analytics-kpi-reading">
        <span className="analytics-kpi-value" title={card.value}>
          {card.value}
        </span>
        {card.unit && <span className="analytics-kpi-unit">{card.unit}</span>}
      </div>
      <p className="analytics-kpi-comparison">{card.comparisonText}</p>
    </article>
  );
}

function BreakdownLegendItem({
  seg,
  showWeight,
}: {
  seg: CategoryBreakdownSegment;
  showWeight: boolean;
}) {
  const Icon = CATEGORY_ICONS[seg.category];
  return (
    <li className="analytics-legend-item">
      <span className={`analytics-legend-swatch analytics-legend-swatch--${seg.category}`} />
      <Icon className="analytics-legend-icon" />
      <span className="analytics-legend-name">{seg.label}</span>
      <span className="analytics-legend-pct">{seg.formattedPercentage}</span>
      <span className="analytics-legend-val">{seg.formattedValue}</span>
      {showWeight && (
        <span
          className="analytics-legend-weight"
          title="Effective energy multiplier (including average KV-cache hit rate)"
        >
          {seg.effectiveMultiplier.toFixed(2).replace(/\.?0+$/, '')}×
        </span>
      )}
    </li>
  );
}

function HiddenCostBarSection({
  breakdown,
  showTechnicalDetails,
}: {
  breakdown: CategoryBreakdownViewModel;
  showTechnicalDetails: boolean;
}) {
  const visibleSegments = breakdown.segments.filter((s) => s.group === 'visible');
  const hiddenSegments = breakdown.segments.filter((s) => s.group === 'hidden');
  const activeVisible = visibleSegments.filter((s) => s.percentage > 0);
  const activeHidden = hiddenSegments.filter((s) => s.percentage > 0);
  const showWeight = showTechnicalDetails && breakdown.isImpactWeighted;

  return (
    <ChartCard title={breakdown.title} subtitle={breakdown.subtitle} tooltip={breakdown.tooltip}>
      {breakdown.totalWeightedValue <= 0 ? (
        <p className="analytics-empty-chart">No activity recorded for the selected timeframe.</p>
      ) : (
        <div className="analytics-breakdown">
          <div className="analytics-bar-captions">
            <span className="analytics-bar-caption">
              Visible · <strong>{breakdown.formattedVisibleSharePct}</strong>
            </span>
            <span className="analytics-bar-caption">
              Behind the Scenes · <strong>{breakdown.formattedHiddenSharePct}</strong>
            </span>
          </div>

          <div
            className="analytics-stacked-bar analytics-stacked-bar--split"
            role="img"
            aria-label={`Visible ${breakdown.formattedVisibleSharePct}, Behind the Scenes ${breakdown.formattedHiddenSharePct}`}
          >
            {activeVisible.length > 0 && (
              <div
                className="analytics-stacked-group analytics-stacked-group--visible"
                style={{ flexGrow: Math.max(0.5, breakdown.visibleSharePct) }}
              >
                {activeVisible.map((seg) => (
                  <div
                    key={seg.category}
                    className={`analytics-stacked-segment analytics-stacked-segment--${seg.category}`}
                    style={{ flexGrow: Math.max(0.5, seg.percentage) }}
                    title={`${seg.label}: ${seg.formattedPercentage} (${seg.formattedValue} · ${formatCompactTokens(seg.rawTokens)} tok)`}
                  />
                ))}
              </div>
            )}

            {activeVisible.length > 0 && activeHidden.length > 0 && (
              <span className="analytics-stacked-divider" aria-hidden="true" />
            )}

            {activeHidden.length > 0 && (
              <div
                className="analytics-stacked-group analytics-stacked-group--hidden"
                style={{ flexGrow: Math.max(0.5, breakdown.hiddenSharePct) }}
              >
                {activeHidden.map((seg) => (
                  <div
                    key={seg.category}
                    className={`analytics-stacked-segment analytics-stacked-segment--${seg.category}`}
                    style={{ flexGrow: Math.max(0.5, seg.percentage) }}
                    title={`${seg.label}: ${seg.formattedPercentage} (${seg.formattedValue} · ${formatCompactTokens(seg.rawTokens)} tok)`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="analytics-legend-groups">
            <div className="analytics-legend-group">
              <div className="analytics-legend-group-header">
                <span className="analytics-legend-group-title">Visible</span>
                <span className="analytics-legend-group-pct">
                  {breakdown.formattedVisibleSharePct}
                </span>
              </div>
              <ul className="analytics-legend-group-list analytics-legend-group-list--visible">
                {visibleSegments.map((seg) => (
                  <BreakdownLegendItem key={seg.category} seg={seg} showWeight={showWeight} />
                ))}
              </ul>
            </div>

            <div className="analytics-legend-group">
              <div className="analytics-legend-group-header">
                <span className="analytics-legend-group-title">Behind the Scenes</span>
                <span className="analytics-legend-group-pct">
                  {breakdown.formattedHiddenSharePct}
                </span>
              </div>
              <ul className="analytics-legend-group-list analytics-legend-group-list--hidden">
                {hiddenSegments.map((seg) => (
                  <BreakdownLegendItem key={seg.category} seg={seg} showWeight={showWeight} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function ModelDonutSection({
  donut,
  mode,
  onModeChange,
}: {
  donut: ModelDonutViewModel;
  mode: ModelUsageMode;
  onModeChange: (mode: ModelUsageMode) => void;
}) {
  const radius = 64;
  const circumference = 2 * Math.PI * radius;

  const toggleControls = (
    <div className="analytics-mini-toggle" role="group" aria-label="Model share mode">
      <button
        type="button"
        className="analytics-mini-toggle-btn"
        aria-pressed={mode === 'impact'}
        onClick={() => onModeChange('impact')}
      >
        {donut.impactToggleLabel}
      </button>
      <button
        type="button"
        className="analytics-mini-toggle-btn"
        aria-pressed={mode === 'prompts'}
        onClick={() => onModeChange('prompts')}
      >
        {donut.messagesToggleLabel}
      </button>
    </div>
  );

  let cumulativeFraction = 0;

  return (
    <ChartCard
      title="Relative Model Usage"
      subtitle={donut.subtitle}
      tooltip={donut.tooltip}
      headerRight={toggleControls}
    >
      {donut.slices.length === 0 ? (
        <p className="analytics-empty-chart">No model activity recorded in this timeframe.</p>
      ) : (
        <div className="analytics-donut-layout">
          <div className="analytics-donut-wrap">
            <svg className="analytics-donut-svg" viewBox="0 0 168 168" aria-hidden="true">
              <circle className="analytics-donut-track" cx="84" cy="84" r={radius} />
              {donut.slices.map((slice) => {
                const fraction =
                  donut.totalValue > 0 ? Math.max(0, slice.value / donut.totalValue) : 0;
                const dashLength = fraction * circumference;
                const dashOffset = -cumulativeFraction * circumference;
                cumulativeFraction += fraction;

                return (
                  <circle
                    key={slice.id}
                    className={`analytics-donut-slice analytics-donut-slice--${slice.colorIndex}`}
                    cx="84"
                    cy="84"
                    r={radius}
                    strokeDasharray={`${dashLength} ${circumference}`}
                    strokeDashoffset={dashOffset}
                  >
                    <title>{`${slice.label}: ${slice.percentage}% (${slice.formattedValue})`}</title>
                  </circle>
                );
              })}
            </svg>
            <div className="analytics-donut-center">
              <span className="analytics-donut-center-value">{donut.centerValue}</span>
              <span className="analytics-donut-center-unit">{donut.centerUnit}</span>
            </div>
          </div>

          <ul className="analytics-donut-legend">
            {donut.slices.map((slice) => (
              <li key={slice.id} className="analytics-donut-row">
                <span className={`analytics-donut-dot analytics-donut-dot--${slice.colorIndex}`} />
                <span className="analytics-donut-label">{slice.label}</span>
                <span className="analytics-donut-meta">{slice.formattedValue}</span>
                <span className="analytics-donut-pct">{slice.percentage}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

function ModelEfficiencySection({
  efficiency,
  mode,
  onModeChange,
}: {
  efficiency: ModelEfficiencyViewModel;
  mode: ModelEfficiencyMode;
  onModeChange: (mode: ModelEfficiencyMode) => void;
}) {
  const headerControls = (
    <div className="analytics-efficiency-controls">
      <span className="analytics-direction-cue">
        {efficiency.directionCue === 'Lower is better' ? '↓ Lower is better' : '↑ Higher is better'}
      </span>
      <div className="analytics-mini-toggle" role="group" aria-label="Model comparison mode">
        <button
          type="button"
          className="analytics-mini-toggle-btn"
          aria-pressed={mode === 'normalized'}
          onClick={() => onModeChange('normalized')}
        >
          Equal Length
        </button>
        <button
          type="button"
          className="analytics-mini-toggle-btn"
          aria-pressed={mode === 'perPrompt'}
          onClick={() => onModeChange('perPrompt')}
        >
          Per Message
        </button>
      </div>
    </div>
  );

  return (
    <ChartCard
      title={efficiency.title}
      subtitle={efficiency.subtitle}
      tooltip={efficiency.tooltip}
      headerRight={headerControls}
    >
      {efficiency.rows.length === 0 ? (
        <p className="analytics-empty-chart">No model comparison data available.</p>
      ) : (
        <ul className="analytics-efficiency-list">
          {efficiency.rows.map((row, index) => {
            const tierClass =
              row.rankIntensity <= 0.34
                ? 'analytics-efficiency-fill--efficient'
                : row.rankIntensity <= 0.67
                  ? 'analytics-efficiency-fill--moderate'
                  : 'analytics-efficiency-fill--intensive';

            return (
              <li
                key={row.id}
                className="analytics-efficiency-item"
                title={row.hoverTooltip}
                tabIndex={0}
              >
                <div className="analytics-efficiency-top">
                  <div className="analytics-efficiency-identity">
                    <div className="analytics-efficiency-name-wrap">
                      <span className="analytics-efficiency-rank">#{index + 1}</span>
                      <span className="analytics-efficiency-name">{row.label}</span>
                      {row.isLowSample && (
                        <span
                          className="analytics-low-sample-badge"
                          title="Fewer than 3 messages in this timeframe"
                        >
                          &lt;3 messages
                        </span>
                      )}
                    </div>
                    <span className="analytics-efficiency-subline">
                      {efficiency.showTechnicalDetails
                        ? `${row.messageCountLabel} · ${row.technicalDetailLabel}`
                        : row.messageCountLabel}
                    </span>
                  </div>
                  <span className="analytics-efficiency-primary">{row.formattedValue}</span>
                </div>
                <div className="analytics-efficiency-track">
                  <div
                    className={`analytics-efficiency-fill ${tierClass}`}
                    style={{ width: `${row.barWidthPct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

function HistoryTimeSeriesSection({ series }: { series: HistoryTimeSeriesViewModel }) {
  const hasAnyData = series.buckets.some((b) => b.promptCount > 0);
  const topScaleLabel =
    series.maxAvgTokens > 0 ? `${formatCompactTokens(series.maxAvgTokens)} tok` : '0 tok';
  const midScaleLabel =
    series.maxAvgTokens > 0
      ? `${formatCompactTokens(Math.round(series.maxAvgTokens / 2))} tok`
      : '';

  const chartLegend = (
    <div className="analytics-series-legend">
      <span className="analytics-series-key">
        <span className="analytics-series-swatch analytics-series-swatch--history" />
        Avg Chat Memory
      </span>
      <span className="analytics-series-key">
        <span className="analytics-series-swatch analytics-series-swatch--new" />
        Avg New Text (You + AI)
      </span>
    </div>
  );

  return (
    <ChartCard
      title="Chat Memory Over Time"
      subtitle={series.subtitle}
      tooltip={series.tooltip}
      headerRight={chartLegend}
    >
      {!hasAnyData ? (
        <p className="analytics-empty-chart">No conversations recorded in this timeframe window.</p>
      ) : (
        <div className="analytics-timeseries">
          <div className="analytics-timeseries-yaxis" aria-hidden="true">
            <span>{topScaleLabel}</span>
            <span>{midScaleLabel}</span>
            <span>0</span>
          </div>

          <div className="analytics-timeseries-plot">
            <div className="analytics-timeseries-gridlines" aria-hidden="true">
              <span className="analytics-timeseries-gridline" />
              <span className="analytics-timeseries-gridline" />
              <span className="analytics-timeseries-gridline" />
            </div>

            <div className="analytics-timeseries-bars" role="list">
              {series.buckets.map((bucket) => (
                <div
                  key={bucket.index}
                  role="listitem"
                  className="analytics-bucket"
                  title={`${bucket.tooltipLabel} · ${bucket.promptCount} ${bucket.promptCount === 1 ? 'message' : 'messages'} · Avg Chat Memory: ${formatCount(bucket.avgHistoryTokens)} tok · Avg New Text: ${formatCount(bucket.avgNewTokens)} tok`}
                >
                  <div className="analytics-bucket-column">
                    {bucket.promptCount > 0 && (
                      <div className="analytics-bucket-stack">
                        {bucket.historyHeightPct > 0 && (
                          <div
                            className="analytics-bucket-bar analytics-bucket-bar--history"
                            style={{ height: `${Math.max(3, bucket.historyHeightPct)}%` }}
                          />
                        )}
                        {bucket.newHeightPct > 0 && (
                          <div
                            className="analytics-bucket-bar analytics-bucket-bar--new"
                            style={{ height: `${Math.max(3, bucket.newHeightPct)}%` }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  <span className="analytics-bucket-label">{bucket.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function EcoInsightBanner({ insight }: { insight: EcoInsightViewModel }) {
  return (
    <aside
      className={`analytics-eco-banner analytics-eco-banner--${insight.tone}`}
      aria-label="Personalized Eco-Insight"
    >
      <div className="analytics-eco-icon">{insight.id === 'sparse' ? <Sparkles /> : <Leaf />}</div>
      <div className="analytics-eco-content">
        <div className="analytics-eco-header">
          <span className="analytics-eco-badge">{insight.badge}</span>
          {insight.savingsBadge && (
            <span className="analytics-eco-savings">{insight.savingsBadge}</span>
          )}
        </div>
        <h3 className="analytics-eco-headline">{insight.headline}</h3>
        <p className="analytics-eco-detail">{insight.detail}</p>
      </div>
    </aside>
  );
}

export function AnalyticsPage({
  records,
  onResetHistory,
  onClearLegacyHistory,
}: AnalyticsPageProps) {
  const [metric, setMetric] = useState<AnalyticsMetricTab>('all');
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>('7d');
  const [modelUsageMode, setModelUsageMode] = useState<ModelUsageMode>('impact');
  const [modelEfficiencyMode, setModelEfficiencyMode] = useState<ModelEfficiencyMode>('normalized');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(
    readTechnicalDetailsPreference,
  );
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isClearingLegacy, setIsClearingLegacy] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(TECHNICAL_DETAILS_STORAGE_KEY, String(showTechnicalDetails));
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [showTechnicalDetails]);

  const nowMs = useMemo(() => Date.now(), [records, timeframe]);
  const safeRecords: readonly PromptRecordDto[] = useMemo(() => records ?? [], [records]);

  const viewModel = useMemo(
    () =>
      aggregateAnalytics(
        safeRecords,
        metric,
        timeframe,
        modelUsageMode,
        nowMs,
        modelEfficiencyMode,
        showTechnicalDetails,
      ),
    [
      safeRecords,
      metric,
      timeframe,
      modelUsageMode,
      nowMs,
      modelEfficiencyMode,
      showTechnicalDetails,
    ],
  );

  const handleExportJson = () => {
    const json = formatRecordsAsJson(safeRecords);
    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(json, `waister-usage-${dateStamp}.json`, 'application/json');
  };

  const handleExportCsv = () => {
    const csv = formatRecordsAsCsv(safeRecords);
    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(csv, `waister-usage-${dateStamp}.csv`, 'text/csv;charset=utf-8');
  };

  const handleConfirmReset = async () => {
    if (!onResetHistory || isResetting) return;
    setIsResetting(true);
    try {
      await onResetHistory();
    } finally {
      setIsResetting(false);
      setConfirmingReset(false);
    }
  };

  const handleClearLegacy = async () => {
    if (!onClearLegacyHistory || isClearingLegacy) return;
    setIsClearingLegacy(true);
    try {
      await onClearLegacyHistory();
    } finally {
      setIsClearingLegacy(false);
    }
  };

  return (
    <section className="analytics-page">
      <header className="analytics-header">
        <div className="analytics-title-row">
          <div>
            <PageTitle>Analytics</PageTitle>
            <p className="analytics-page-subtitle">
              {records === undefined ? 'Loading your activity…' : viewModel.headerSubtitle}
            </p>
          </div>
        </div>

        <div className="analytics-controls-bar">
          <div className="analytics-metric-tabs" role="tablist" aria-label="Metric focus">
            {ANALYTICS_METRIC_TABS.map((tab) => {
              const Icon = METRIC_TAB_ICONS[tab.id];
              const isSelected = tab.id === metric;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className="analytics-metric-tab"
                  onClick={() => setMetric(tab.id)}
                >
                  <Icon />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="timeframe-picker" role="group" aria-label="Timeframe">
            {ANALYTICS_TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                type="button"
                className="timeframe-picker-chip"
                aria-pressed={tf.id === timeframe}
                onClick={() => setTimeframe(tf.id)}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {viewModel.totalLegacyRecordCount > 0 && (
        <div className="analytics-legacy-notice" role="status">
          <div className="analytics-legacy-copy">
            <AlertTriangle className="analytics-legacy-icon" />
            <span>
              {formatCount(viewModel.totalLegacyRecordCount)} older{' '}
              {viewModel.totalLegacyRecordCount === 1 ? 'message lacks' : 'messages lack'} a
              detailed breakdown and {viewModel.totalLegacyRecordCount === 1 ? 'is' : 'are'}{' '}
              excluded from fair model comparisons.
            </span>
          </div>
          {onClearLegacyHistory && (
            <button
              type="button"
              className="analytics-action-btn"
              disabled={isClearingLegacy}
              onClick={() => void handleClearLegacy()}
            >
              <Trash2 />
              <span>{isClearingLegacy ? 'Clearing…' : 'Clear Older Data'}</span>
            </button>
          )}
        </div>
      )}

      {/* Row 1: Compact KPI Cards */}
      <div className="analytics-kpi-grid">
        {viewModel.kpis.map((card) => (
          <KpiCard key={card.id} card={card} />
        ))}
      </div>

      {/* Row 2 (Full Width): Two-Group Stacked Breakdown Bar */}
      <HiddenCostBarSection
        breakdown={viewModel.breakdown}
        showTechnicalDetails={showTechnicalDetails}
      />

      {/* Row 3 (2-Column Grid): Model Comparison */}
      <div className="analytics-model-grid">
        <ModelDonutSection
          donut={viewModel.modelDonut}
          mode={modelUsageMode}
          onModeChange={setModelUsageMode}
        />
        <ModelEfficiencySection
          efficiency={viewModel.modelEfficiency}
          mode={modelEfficiencyMode}
          onModeChange={setModelEfficiencyMode}
        />
      </div>

      {/* Row 4 (Full Width): Chat Memory Over Time */}
      <HistoryTimeSeriesSection series={viewModel.historySeries} />

      {/* Row 5: Personalized Eco-Insight Banner & Subtle Footer */}
      <EcoInsightBanner insight={viewModel.ecoInsight} />

      <footer className="analytics-footer">
        <div className="analytics-footer-left">
          <p className="analytics-footer-note">
            Environmental figures are estimates based on published AI and datacenter research, not
            direct provider telemetry.
          </p>
          <label className="analytics-tech-toggle">
            <input
              type="checkbox"
              className="analytics-tech-checkbox"
              checked={showTechnicalDetails}
              onChange={(event) => setShowTechnicalDetails(event.target.checked)}
            />
            <SlidersHorizontal className="analytics-tech-icon" />
            <span>Show technical details</span>
          </label>
        </div>

        <div className="analytics-footer-actions">
          <button
            type="button"
            className="analytics-action-btn"
            disabled={safeRecords.length === 0}
            onClick={handleExportJson}
          >
            <Download />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            className="analytics-action-btn"
            disabled={safeRecords.length === 0}
            onClick={handleExportCsv}
          >
            <Download />
            <span>Export CSV</span>
          </button>

          {!confirmingReset ? (
            <button
              type="button"
              className="analytics-action-btn analytics-action-btn--danger"
              disabled={safeRecords.length === 0}
              onClick={() => setConfirmingReset(true)}
            >
              <Trash2 />
              <span>Reset History</span>
            </button>
          ) : (
            <div className="analytics-reset-confirm" role="group" aria-label="Confirm reset">
              <span className="analytics-reset-prompt">
                Clear all {safeRecords.length} {safeRecords.length === 1 ? 'message' : 'messages'}?
              </span>
              <button
                type="button"
                className="analytics-action-btn analytics-action-btn--confirm"
                disabled={isResetting}
                onClick={() => void handleConfirmReset()}
              >
                {isResetting ? 'Clearing…' : 'Confirm'}
              </button>
              <button
                type="button"
                className="analytics-action-btn"
                disabled={isResetting}
                onClick={() => setConfirmingReset(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </footer>
    </section>
  );
}
