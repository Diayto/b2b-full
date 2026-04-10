import { getAPIBaseURL } from '@/lib/config';
import {
  insertConnectedSource,
  insertProcessedMetricsRow,
  maxYmd,
  minYmd,
  ymdDaysAgo,
  ymdToday,
} from '@/lib/supabaseMetrics';

type ContentSummaryResponse = {
  ok: boolean;
  summary?: {
    rowCount: number;
    sumLeadsGenerated: number;
    sumDealsGenerated: number;
    sumPaidConversions: number;
    sumImpressions: number;
    minPublishedAt: string | null;
    maxPublishedAt: string | null;
  };
};

type CountSummaryResponse = {
  ok: boolean;
  count?: number;
  minCreatedDate?: string | null;
  maxCreatedDate?: string | null;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json()) as T;
  return data;
}

/**
 * Pulls SQLite summaries from the Node backend and writes one processed_metrics row + connected_sources (instagram).
 * Safe to call after live-pull / manual sync / OAuth; no-op failure is logged only.
 */
export async function persistInstagramPipelineMetrics(companyId: string): Promise<void> {
  if (!companyId) return;

  const base = getAPIBaseURL();
  const q = new URLSearchParams({ companyId });

  const [cm, le, de] = await Promise.all([
    getJson<ContentSummaryResponse>(`${base}/api/content-metrics/summary?${q}`),
    getJson<CountSummaryResponse>(`${base}/api/leads/summary?${q}`),
    getJson<CountSummaryResponse>(`${base}/api/deals/summary?${q}`),
  ]);

  if (!cm.ok || !cm.summary) {
    throw new Error('Content metrics summary unavailable');
  }
  if (!le.ok || le.count === undefined) {
    throw new Error('Leads summary unavailable');
  }
  if (!de.ok || de.count === undefined) {
    throw new Error('Deals summary unavailable');
  }

  const s = cm.summary;
  const leadCount = Math.max(le.count, s.sumLeadsGenerated);
  const dealCount = Math.max(de.count, s.sumDealsGenerated);
  const revenueEvents = s.sumPaidConversions;

  const periodCandidates = [
    s.minPublishedAt,
    s.maxPublishedAt,
    le.minCreatedDate,
    le.maxCreatedDate,
    de.minCreatedDate,
    de.maxCreatedDate,
  ].filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x));

  const periodStart = minYmd(periodCandidates) ?? ymdDaysAgo(30);
  const periodEnd = maxYmd(periodCandidates) ?? ymdToday();

  const raw_data = {
    source: 'instagram_pipeline',
    companyId,
    contentMetrics: s,
    leadsTable: { count: le.count, min: le.minCreatedDate, max: le.maxCreatedDate },
    dealsTable: { count: de.count, min: de.minCreatedDate, max: de.maxCreatedDate },
    note: 'revenue field uses sum(paid_conversions) from content rows as a count proxy until monetary pipeline exists',
  };

  await insertProcessedMetricsRow({
    period_start: periodStart,
    period_end: periodEnd,
    spend: 0,
    leads: leadCount,
    deals: dealCount,
    revenue: revenueEvents,
    cash_inflow: 0,
    cash_outflow: 0,
    net_cash: 0,
    raw_data,
  });

  await insertConnectedSource({
    type: 'instagram',
    status: 'active',
    meta: {
      lastDigestAt: new Date().toISOString(),
      contentRowCount: s.rowCount,
    },
  });
}
