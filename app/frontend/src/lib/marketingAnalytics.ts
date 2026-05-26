import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import { formatKZT } from '@/lib/metrics';

export type MarketingChannelRow = {
  name: string;
  spend: number;
  leads: number;
  deals: number;
  revenue: number;
};

export type MarketingContentRow = {
  id: string;
  title: string;
  reach: number;
  leads: number;
  conversions: number;
};

export type MarketingPeriodEfficiency = {
  spend: number;
  leads: number;
  deals: number;
  revenue: number;
  cpl: number | null;
  leadToDealPct: number | null;
  costPerDeal: number | null;
  avgCheck: number | null;
  romiPct: number | null;
};

export type MarketingBundle = {
  channels: MarketingChannelRow[];
  content: MarketingContentRow[];
};

const DEMO_MARKETING: MarketingBundle = {
  channels: [
    { name: 'Instagram organic', spend: 180_000, leads: 22, deals: 2, revenue: 890_000 },
    { name: 'Meta Ads', spend: 520_000, leads: 14, deals: 2, revenue: 1_120_000 },
    { name: 'Referral', spend: 0, leads: 6, deals: 1, revenue: 640_000 },
  ],
  content: [
    { id: 'video_23', title: 'Ошибки в CV', reach: 124_000, leads: 11, conversions: 2 },
    { id: 'video_18', title: 'Как пройти собеседование', reach: 86_000, leads: 9, conversions: 1 },
    { id: 'video_31', title: 'Стипендии 2026', reach: 52_000, leads: 7, conversions: 1 },
    { id: 'video_12', title: 'История выпускника', reach: 41_000, leads: 5, conversions: 1 },
    { id: 'video_05', title: 'День из жизни студента', reach: 28_000, leads: 3, conversions: 0 },
  ],
};

export function extractMarketingBundle(raw: Record<string, unknown> | null | undefined): MarketingBundle {
  if (!raw) return { channels: [], content: [] };
  if (raw.source === 'chrona_demo_preview') {
    return DEMO_MARKETING;
  }
  const m = raw.marketing as Record<string, unknown> | undefined;
  if (!m) return { channels: [], content: [] };
  const channels = Array.isArray(m.channels)
    ? (m.channels as unknown[])
        .map(parseChannelRow)
        .filter((r): r is MarketingChannelRow => r !== null)
    : [];
  const content = Array.isArray(m.content)
    ? (m.content as unknown[])
        .map(parseContentRow)
        .filter((r): r is MarketingContentRow => r !== null)
    : [];
  return { channels, content };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseChannelRow(v: unknown): MarketingChannelRow | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const name = String(o.name ?? o.channel ?? '').trim();
  if (!name) return null;
  return {
    name,
    spend: num(o.spend),
    leads: Math.round(num(o.leads)),
    deals: Math.round(num(o.deals)),
    revenue: num(o.revenue),
  };
}

function parseContentRow(v: unknown): MarketingContentRow | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = String(o.id ?? o.contentId ?? '').trim();
  const title = String(o.title ?? o.contentTitle ?? id).trim();
  if (!id && !title) return null;
  return {
    id: id || title,
    title: title || id,
    reach: Math.round(num(o.reach ?? o.impressions)),
    leads: Math.round(num(o.leads)),
    conversions: Math.round(num(o.conversions ?? o.paidConversions)),
  };
}

export function computePeriodEfficiency(row: ProcessedMetricsRow): MarketingPeriodEfficiency {
  const spend = num(row.spend);
  const leads = Math.round(num(row.leads));
  const deals = Math.round(num(row.deals));
  const revenue = num(row.revenue);
  const raw = row.raw_data as Record<string, unknown> | null;
  const isIgPipeline = raw?.source === 'instagram_pipeline';

  return {
    spend,
    leads,
    deals,
    revenue: isIgPipeline ? 0 : revenue,
    cpl: spend > 0 && leads > 0 ? spend / leads : null,
    leadToDealPct: leads > 0 ? (deals / leads) * 100 : null,
    costPerDeal: spend > 0 && deals > 0 ? spend / deals : null,
    avgCheck: !isIgPipeline && deals > 0 && revenue > 0 ? revenue / deals : null,
    romiPct: !isIgPipeline && spend > 0 && revenue > 0 ? ((revenue - spend) / spend) * 100 : null,
  };
}

export function enrichChannels(rows: MarketingChannelRow[]): Array<
  MarketingChannelRow & { cpl: number | null; leadToDealPct: number | null }
> {
  return rows.map((r) => ({
    ...r,
    cpl: r.spend > 0 && r.leads > 0 ? r.spend / r.leads : null,
    leadToDealPct: r.leads > 0 ? (r.deals / r.leads) * 100 : null,
  }));
}

export function topContentByLeads(content: MarketingContentRow[], n = 5): MarketingContentRow[] {
  return [...content].sort((a, b) => b.leads - a.leads || b.reach - a.reach).slice(0, n);
}

export function formatMoneyShort(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return formatKZT(value);
}

export function formatPct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}
