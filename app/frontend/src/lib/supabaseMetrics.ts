import { getSupabaseClient } from '@/lib/supabaseClient';

export type ProcessedMetricsRow = {
  id: string;
  company_id: string;
  period_start: string | null;
  period_end: string | null;
  spend: number;
  leads: number;
  deals: number;
  revenue: number;
  cash_inflow: number;
  cash_outflow: number;
  net_cash: number;
  raw_data: Record<string, unknown> | null;
  created_at: string;
};

function ymdToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function ymdDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function minYmd(dates: string[]): string | null {
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (valid.length === 0) return null;
  return valid.sort()[0];
}

function maxYmd(dates: string[]): string | null {
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (valid.length === 0) return null;
  return valid.sort()[valid.length - 1];
}

export async function fetchLatestProcessedMetrics(): Promise<ProcessedMetricsRow | null> {
  const sb = getSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) return null;

  const { data, error } = await sb
    .from('processed_metrics')
    .select('*')
    .eq('company_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data as ProcessedMetricsRow | null;
}

export type InsertProcessedMetricsInput = {
  period_start: string;
  period_end: string;
  spend: number;
  leads: number;
  deals: number;
  revenue: number;
  cash_inflow: number;
  cash_outflow: number;
  net_cash: number;
  raw_data?: Record<string, unknown>;
};

export async function insertProcessedMetricsRow(input: InsertProcessedMetricsInput): Promise<{ id: string }> {
  const sb = getSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) {
    throw new Error('Не выполнен вход');
  }

  const { data, error } = await sb
    .from('processed_metrics')
    .insert({
      company_id: user.id,
      period_start: input.period_start,
      period_end: input.period_end,
      spend: input.spend,
      leads: Math.round(input.leads),
      deals: Math.round(input.deals),
      revenue: input.revenue,
      cash_inflow: input.cash_inflow,
      cash_outflow: input.cash_outflow,
      net_cash: input.net_cash,
      raw_data: input.raw_data ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Не удалось сохранить метрики');
  }

  try {
    const { runInsightPipelineAfterMetricsWrite } = await import('@/lib/supabaseInsights');
    await runInsightPipelineAfterMetricsWrite();
  } catch (e) {
    console.warn('[Chrona] runInsightPipelineAfterMetricsWrite failed', e);
  }

  return { id: data.id as string };
}

export async function insertConnectedSource(params: {
  type: 'upload' | 'instagram';
  status: 'pending' | 'active' | 'error';
  meta?: Record<string, unknown>;
}): Promise<void> {
  const sb = getSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) {
    throw new Error('Не выполнен вход');
  }

  const { error } = await sb.from('connected_sources').insert({
    company_id: user.id,
    type: params.type,
    status: params.status,
    meta: params.meta ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export { ymdToday, ymdDaysAgo, minYmd, maxYmd };
