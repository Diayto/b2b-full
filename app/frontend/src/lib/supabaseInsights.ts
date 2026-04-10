import { getSupabaseClient } from '@/lib/supabaseClient';
import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import { evaluateProcessedMetricsInsight, type InsightEvaluation } from '@/lib/insightEngine';

export type InsightRow = {
  id: string;
  company_id: string;
  generated_at: string;
  period_start: string | null;
  period_end: string | null;
  main_issue: string;
  recommended_action: string;
  priority_score: number;
  data_context: Record<string, unknown> | null;
};

export async function fetchLastTwoProcessedMetrics(): Promise<[ProcessedMetricsRow | null, ProcessedMetricsRow | null]> {
  const sb = getSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) return [null, null];

  const { data, error } = await sb
    .from('processed_metrics')
    .select('*')
    .eq('company_id', user.id)
    .order('created_at', { ascending: false })
    .limit(2);

  if (error) {
    throw new Error(error.message);
  }
  const rows = (data ?? []) as ProcessedMetricsRow[];
  return [rows[0] ?? null, rows[1] ?? null];
}

export async function upsertInsightForPeriod(
  metricsRow: ProcessedMetricsRow,
  evaluation: InsightEvaluation,
): Promise<void> {
  const sb = getSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) {
    throw new Error('Не выполнен вход');
  }

  const periodStart = metricsRow.period_start ?? '1970-01-01';
  const periodEnd = metricsRow.period_end ?? '1970-01-01';

  const payload = {
    company_id: user.id,
    period_start: periodStart,
    period_end: periodEnd,
    generated_at: new Date().toISOString(),
    main_issue: evaluation.main_issue,
    recommended_action: evaluation.recommended_action,
    priority_score: evaluation.priority_score,
    data_context: {
      ...evaluation.data_context,
      matchedRule: evaluation.matchedRule,
    },
  };

  const { error } = await sb.from('insights').upsert(payload, {
    onConflict: 'company_id,period_start,period_end',
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function runInsightPipelineAfterMetricsWrite(): Promise<void> {
  const [latest, previous] = await fetchLastTwoProcessedMetrics();
  if (!latest) return;
  const evaluation = evaluateProcessedMetricsInsight(latest, previous);
  await upsertInsightForPeriod(latest, evaluation);
}

export async function fetchLatestInsight(): Promise<InsightRow | null> {
  const sb = getSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) return null;

  const { data, error } = await sb
    .from('insights')
    .select('*')
    .eq('company_id', user.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    ...(row as unknown as InsightRow),
    priority_score: Number(row.priority_score ?? 0),
  };
}
