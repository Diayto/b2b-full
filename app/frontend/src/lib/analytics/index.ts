// ============================================================
// BizPulse Analytics — Module Barrel
// Single source of truth for all analytics imports
// ============================================================

// --- Revenue Control Tower (core engine) ---
export type {
  RevenueControlTowerAnalytics,
  ValueKpi,
  RatioKpi,
  MoneyKpi,
  GrowthKpi,
  FunnelDropOffResult,
  SalesCashPriorityInputs,
  InsightLayerInputSignals,
  ChannelCampaignRow,
  CoverageMeta,
  CalculationMode,
  PriorityActionCandidate,
} from './revenueControlTower';

export { calculateRevenueControlTowerAnalytics } from './revenueControlTower';

// --- Model & Attribution ---
export type {
  RevenueControlTowerModel,
  AttributionResult,
  LinkMode,
} from './model';

export { buildRevenueControlTowerModel, resolvePaymentAttribution, resolveInvoiceOutstandingExact } from './model';

// --- Unified Funnel Model ---
export type {
  FunnelStage,
  FunnelStageMetrics,
  UnifiedFunnelResult,
  FunnelTransition,
} from './funnel';

export {
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  computeUnifiedFunnel,
  computeFunnelTransitions,
} from './funnel';

// --- Extended Domain Types ---
export type {
  SourceType,
  ContentPlatform,
  ContentMetric,
  ParsedContentMetricRow,
  StalledReason,
  LeakageCategory,
  LeakageItem,
  LeakageSummary,
  CompletenessScore,
  SystemCompleteness,
  MetricExplanation,
  ExplainableMetric,
} from './domain';

export {
  SOURCE_TYPE_LABELS,
  PLATFORM_LABELS,
  STALLED_REASON_LABELS,
  LEAKAGE_LABELS,
} from './domain';

// --- Leakage Analysis ---
export type { LeakageAnalysisInput } from './leakage';
export { computeLeakageAnalysis } from './leakage';

// --- Completeness Scoring ---
export { computeSystemCompleteness } from './completeness';

// --- Content / Organic Analytics ---
export type {
  ContentPerformanceSummary,
  ContentMetricRanked,
  PlatformSummary,
} from './content';

export { computeContentPerformance } from './content';

// --- Source Performance ---
export type { SourcePerformanceRow } from './sourcePerformance';
export { computeSourcePerformance, classifySources } from './sourcePerformance';

// --- Lost Deals Analysis ---
export type {
  LostDealEnriched,
  LostReasonBreakdown,
  ManagerLossBreakdown,
  LostDealsAnalysis,
} from './lostDeals';

export { computeLostDealsAnalysis, LOST_REASON_LABELS } from './lostDeals';

// --- Explainability Layer ---
export {
  EXPLAIN_THRESHOLDS,
  explainRevenue,
  explainConversionRate,
  explainOverdue,
  explainFunnelDropOff,
  explainLeakage,
  explainCompleteness,
  explainROI,
} from './explainability';

// --- Date utilities ---
export {
  isValidYmd,
  isDateInRangeInclusive,
  getPreviousDateRange,
  isMonthOverlappingRange,
  getTodayMidnight,
} from './dateRange';
