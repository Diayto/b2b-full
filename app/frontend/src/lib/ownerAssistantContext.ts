import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import type { InsightRow } from '@/lib/supabaseInsights';
import type { OwnerCloudBundle } from '@/lib/ownerCloudBundle';
import { buildExecutionPlan, parseMatchedRule } from '@/lib/insightExecutionPlan';
import { buildFunnelBreakdown } from '@/lib/chronaSourceCredibility';

export type OwnerAssistantContext = {
  dataSource: string;
  isDemoPreview: boolean;
  period: { start: string | null; end: string | null };
  metrics: {
    spend: number;
    leads: number;
    deals: number;
    revenue: number;
    cashInflow: number;
    cashOutflow: number;
    netCash: number;
  };
  insight: {
    mainIssue: string | null;
    recommendedAction: string | null;
    ruleId: number | null;
    dataContext: Record<string, unknown> | null;
  };
  funnel: {
    stages: { label: string; count: number }[];
    mainDrop: string;
  } | null;
  executionPlan: {
    bottleneckLabel: string;
    chainHint: string;
    weeklySteps: string[];
    monthlyDirection: string;
  } | null;
  rawSource: string | null;
};

export function buildOwnerAssistantContext(
  bundle: OwnerCloudBundle | null,
  row: ProcessedMetricsRow | null,
  insight: InsightRow | null,
): OwnerAssistantContext | null {
  if (!row) return null;

  const raw = (row.raw_data ?? {}) as Record<string, unknown>;
  const rule = parseMatchedRule(insight);
  const plan = buildExecutionPlan(insight);
  const funnel = buildFunnelBreakdown(row, raw, rule);

  return {
    dataSource: bundle?.source ?? 'unknown',
    isDemoPreview: Boolean(bundle?.isStaticDemo),
    period: {
      start: row.period_start ?? null,
      end: row.period_end ?? null,
    },
    metrics: {
      spend: Number(row.spend) || 0,
      leads: Number(row.leads) || 0,
      deals: Number(row.deals) || 0,
      revenue: Number(row.revenue) || 0,
      cashInflow: Number(row.cash_inflow) || 0,
      cashOutflow: Number(row.cash_outflow) || 0,
      netCash: Number(row.net_cash) || 0,
    },
    insight: {
      mainIssue: insight?.main_issue ?? null,
      recommendedAction: insight?.recommended_action ?? null,
      ruleId: rule,
      dataContext:
        insight?.data_context && typeof insight.data_context === 'object'
          ? (insight.data_context as Record<string, unknown>)
          : null,
    },
    funnel: funnel
      ? {
          stages: funnel.stages.map((s) => ({ label: s.label, count: s.count })),
          mainDrop: funnel.mainDrop,
        }
      : null,
    executionPlan: plan
      ? {
          bottleneckLabel: plan.bottleneckLabel,
          chainHint: plan.chainHint,
          weeklySteps: plan.weeklySteps,
          monthlyDirection: plan.monthlyDirection,
        }
      : null,
    rawSource: typeof raw.source === 'string' ? raw.source : null,
  };
}
