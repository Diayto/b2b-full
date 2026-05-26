import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import type { InsightRow } from '@/lib/supabaseInsights';
import type { OwnerCloudBundle } from '@/lib/ownerCloudBundle';
import { buildExecutionPlan, parseMatchedRule } from '@/lib/insightExecutionPlan';
import { buildFunnelBreakdown } from '@/lib/chronaSourceCredibility';
import { computePeriodEfficiency, extractMarketingBundle } from '@/lib/marketingAnalytics';
import { getDemoScenarioLabel } from '@/lib/chronaDemoGenerator';

export type OwnerAssistantContext = {
  dataSource: string;
  isDemoPreview: boolean;
  scenarioLabel: string | null;
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
  efficiency: {
    cpl: number | null;
    leadToDealPct: number | null;
    costPerDeal: number | null;
    avgCheck: number | null;
    romiPct: number | null;
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
  marketing: {
    channels: { name: string; spend: number; leads: number; deals: number; cpl: number | null }[];
    topContent: { id: string; title: string; reach: number; leads: number; conversions: number }[];
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
  const efficiency = computePeriodEfficiency(row);
  const marketingBundle = extractMarketingBundle(raw);

  const channels = marketingBundle.channels.map((c) => ({
    name: c.name,
    spend: c.spend,
    leads: c.leads,
    deals: c.deals,
    cpl: c.spend > 0 && c.leads > 0 ? c.spend / c.leads : null,
  }));

  const topContent = [...marketingBundle.content]
    .sort((a, b) => b.leads - a.leads || b.reach - a.reach)
    .slice(0, 5);

  return {
    dataSource: bundle?.source ?? 'unknown',
    isDemoPreview: Boolean(bundle?.isStaticDemo),
    scenarioLabel: getDemoScenarioLabel(row),
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
    efficiency: {
      cpl: efficiency.cpl,
      leadToDealPct: efficiency.leadToDealPct,
      costPerDeal: efficiency.costPerDeal,
      avgCheck: efficiency.avgCheck,
      romiPct: efficiency.romiPct,
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
    marketing:
      channels.length > 0 || topContent.length > 0
        ? { channels, topContent }
        : null,
    rawSource: typeof raw.source === 'string' ? raw.source : null,
  };
}
