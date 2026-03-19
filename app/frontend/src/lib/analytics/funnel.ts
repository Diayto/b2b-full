// ============================================================
// BizPulse — Unified Revenue Funnel Model
//
// Canonical funnel for the entire product:
//   Traffic/Reach → Engagement → Lead → Deal → Won → Invoice → Paid
//
// All pages are slices of this same funnel:
//   Dashboard = executive overview of entire funnel
//   Marketing = top funnel (traffic → lead) + source/content efficiency
//   Sales/Cash = lower funnel (deal → paid) + stalled/lost/unpaid
// ============================================================

export type FunnelStage =
  | 'traffic'
  | 'engagement'
  | 'lead'
  | 'deal'
  | 'won'
  | 'invoiced'
  | 'paid';

export const FUNNEL_STAGES: FunnelStage[] = [
  'traffic',
  'engagement',
  'lead',
  'deal',
  'won',
  'invoiced',
  'paid',
];

export const FUNNEL_STAGE_LABELS: Record<FunnelStage, string> = {
  traffic: 'Трафик / Охват',
  engagement: 'Вовлечение',
  lead: 'Лид',
  deal: 'Сделка',
  won: 'Выиграна',
  invoiced: 'Счёт',
  paid: 'Оплачено',
};

export interface FunnelStageMetrics {
  stage: FunnelStage;
  count: number;
  value: number;
  conversionToNext: number | null;   // 0..1, null if last stage
  dropOffFromPrev: number | null;    // absolute count lost, null if first stage
  dropOffRate: number | null;        // 0..1
}

export interface UnifiedFunnelResult {
  stages: FunnelStageMetrics[];
  overallConversion: number;         // traffic→paid or lead→paid
  bottleneckStage: FunnelStage;
  bottleneckDropRate: number;
  totalLeakage: number;              // total lost value across funnel
}

/**
 * Transition between two adjacent funnel stages.
 * Used for leakage analysis.
 */
export interface FunnelTransition {
  from: FunnelStage;
  to: FunnelStage;
  inputCount: number;
  outputCount: number;
  conversionRate: number;  // 0..1
  lostCount: number;
  lostValue: number;
}

/**
 * Compute unified funnel from stage counts.
 * Input: map of stage → { count, value }
 */
export function computeUnifiedFunnel(
  stageData: Partial<Record<FunnelStage, { count: number; value: number }>>,
): UnifiedFunnelResult {
  const stages: FunnelStageMetrics[] = [];
  let maxDropRate = 0;
  let bottleneckStage: FunnelStage = 'lead';
  let totalLeakage = 0;

  for (let i = 0; i < FUNNEL_STAGES.length; i++) {
    const stage = FUNNEL_STAGES[i];
    const data = stageData[stage] ?? { count: 0, value: 0 };
    const prevData = i > 0 ? (stageData[FUNNEL_STAGES[i - 1]] ?? { count: 0, value: 0 }) : null;
    const nextData = i < FUNNEL_STAGES.length - 1 ? (stageData[FUNNEL_STAGES[i + 1]] ?? { count: 0, value: 0 }) : null;

    const conversionToNext = nextData !== null && data.count > 0
      ? nextData.count / data.count
      : null;
    const dropOffFromPrev = prevData !== null
      ? Math.max(0, prevData.count - data.count)
      : null;
    const dropOffRate = prevData !== null && prevData.count > 0
      ? Math.max(0, (prevData.count - data.count) / prevData.count)
      : null;

    if (dropOffRate !== null && dropOffRate > maxDropRate) {
      maxDropRate = dropOffRate;
      bottleneckStage = stage;
    }

    if (dropOffFromPrev !== null) {
      totalLeakage += dropOffFromPrev;
    }

    stages.push({
      stage,
      count: data.count,
      value: data.value,
      conversionToNext: conversionToNext !== null ? clamp01(conversionToNext) : null,
      dropOffFromPrev,
      dropOffRate: dropOffRate !== null ? clamp01(dropOffRate) : null,
    });
  }

  const firstCount = stageData.lead?.count ?? stageData.traffic?.count ?? 0;
  const lastCount = stageData.paid?.count ?? 0;
  const overallConversion = firstCount > 0 ? lastCount / firstCount : 0;

  return {
    stages,
    overallConversion: clamp01(overallConversion),
    bottleneckStage,
    bottleneckDropRate: clamp01(maxDropRate),
    totalLeakage,
  };
}

/**
 * Compute transitions between adjacent funnel stages for leakage analysis.
 */
export function computeFunnelTransitions(
  stageData: Partial<Record<FunnelStage, { count: number; value: number }>>,
): FunnelTransition[] {
  const transitions: FunnelTransition[] = [];

  for (let i = 0; i < FUNNEL_STAGES.length - 1; i++) {
    const from = FUNNEL_STAGES[i];
    const to = FUNNEL_STAGES[i + 1];
    const fromData = stageData[from] ?? { count: 0, value: 0 };
    const toData = stageData[to] ?? { count: 0, value: 0 };
    const lostCount = Math.max(0, fromData.count - toData.count);

    transitions.push({
      from,
      to,
      inputCount: fromData.count,
      outputCount: toData.count,
      conversionRate: fromData.count > 0 ? clamp01(toData.count / fromData.count) : 0,
      lostCount,
      lostValue: fromData.value > 0 && fromData.count > 0
        ? (lostCount / fromData.count) * fromData.value
        : 0,
    });
  }

  return transitions;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
