// Task 3 — UI adapter: one cloud insight → RecommendationsCard shape

import type { InsightRow } from '@/lib/supabaseInsights';

export type RecommendationPriority = 'high' | 'medium' | 'low';
export type RecommendationKind = 'risk' | 'action' | 'insight';
export type RecommendationSurface = 'executive' | 'marketing' | 'sales_cash';

export interface RecommendationItem {
  id: string;
  kind: RecommendationKind;
  priority: RecommendationPriority;
  title: string;
  what: string;
  why: string;
  next: string;
  tags?: string[];
}

/** Legacy hook — analytics-based list removed (Task 3). Use insightRowToRecommendationItems + Supabase. */
export interface BuildRecommendationsParams {
  analytics: unknown;
  channelNameById?: Map<string, string>;
  maxItems?: number;
  surface: RecommendationSurface;
  formatMoney?: (value: number) => string;
}

export function buildRecommendations(_params: BuildRecommendationsParams): RecommendationItem[] {
  return [];
}

function priorityFromScore(score: number): RecommendationPriority {
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

export function insightRowToRecommendationItems(row: InsightRow | null): RecommendationItem[] {
  if (!row) return [];
  const rule = (row.data_context as { matchedRule?: number } | null)?.matchedRule;
  const ps = Number(row.priority_score);
  return [
    {
      id: 'cloud_insight_latest',
      kind: 'action',
      priority: priorityFromScore(ps),
      title: 'Приоритетный инсайт',
      what: row.main_issue,
      why: 'По последней строке processed_metrics в Supabase.',
      next: row.recommended_action,
      tags: typeof rule === 'number' ? [`rule_${rule}`] : undefined,
    },
  ];
}
