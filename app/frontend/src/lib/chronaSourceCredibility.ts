import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import { formatKZT } from '@/lib/metrics';
import type { InsightRuleId } from '@/lib/insightEngine';

export type InstagramSourceSignal = {
  handle: string;
  followersLabel: string;
  reachLabel: string;
  engagementRateLabel: string;
  leadsAttributed: number;
  interpretation: string;
};

export type TableSourceSignal = {
  title: string;
  subtitle: string;
  leadsInSvod: number;
  dealsInSvod: number;
  revenueLabel: string;
  interpretation: string;
};

function isPackagedDemo(_row: ProcessedMetricsRow, raw: Record<string, unknown>): boolean {
  return raw.source === 'chrona_demo_preview';
}

function demoInstagramFromRaw(raw: Record<string, unknown>, row: ProcessedMetricsRow): InstagramSourceSignal {
  const m = (raw.marketing as Record<string, unknown> | undefined) ?? {};
  const ig = (m.instagram as Record<string, unknown> | undefined) ?? {};
  const handle = typeof ig.handle === 'string' ? ig.handle : '@chrona.demo';
  const followers =
    typeof ig.followers === 'number' ? `${(ig.followers / 1000).toFixed(1)} тыс.` : '—';
  const reach = typeof ig.reach === 'number' ? `${Math.round(ig.reach / 1000)} тыс.` : '—';
  const er = typeof ig.engagement_rate === 'number' ? `${ig.engagement_rate.toFixed(1)}%` : '—';
  const igLeads =
    Array.isArray(m.channels) && m.channels[0]
      ? Math.round(Number((m.channels[0] as Record<string, unknown>).leads) || 0)
      : Math.round(Number(row.leads) * 0.5);
  const scenario = typeof raw.scenarioLabel === 'string' ? raw.scenarioLabel : 'демо-период';
  return {
    handle: handle.startsWith('@') ? handle : `@${handle}`,
    followersLabel: followers,
    reachLabel: reach,
    engagementRateLabel: er,
    leadsAttributed: Math.min(igLeads, Number(row.leads) || igLeads),
    interpretation: `Демо-снимок «${scenario}»: канал даёт заявки; сверьте с общей воронкой периода.`,
  };
}

export function resolveInstagramSignal(
  row: ProcessedMetricsRow,
  raw: Record<string, unknown>,
): InstagramSourceSignal | null {
  if (isPackagedDemo(row, raw)) {
    return demoInstagramFromRaw(raw, row);
  }
  if (raw.source === 'instagram_pipeline') {
    const ig = (raw.instagram as Record<string, unknown> | undefined) ?? {};
    const handle = typeof ig.handle === 'string' ? ig.handle : '@instagram';
    const followers =
      typeof ig.followers === 'number' ? `${(ig.followers / 1000).toFixed(1)} тыс.` : '—';
    const reach = typeof ig.reach === 'number' ? `${Math.round(ig.reach / 1000)} тыс.` : '—';
    const er = typeof ig.engagement_rate === 'number' ? `${ig.engagement_rate.toFixed(1)}%` : '—';
    const leadsAttr = Math.round(Number(row.leads) * 0.65) || Number(row.leads);
    return {
      handle: handle.startsWith('@') ? handle : `@${handle}`,
      followersLabel: followers,
      reachLabel: reach,
      engagementRateLabel: er,
      leadsAttributed: Math.min(leadsAttr, Number(row.leads) || leadsAttr),
      interpretation:
        'Заявки с канала попадают в общую модель периода; вывод на главном экране учитывает всю цепочку.',
    };
  }
  return null;
}

export function resolveTableSourceSignal(row: ProcessedMetricsRow, raw: Record<string, unknown>): TableSourceSignal {
  const leads = Math.round(Number(row.leads) || 0);
  const deals = Math.round(Number(row.deals) || 0);
  const rev = formatKZT(Number(row.revenue) || 0);

  if (isPackagedDemo(row, raw)) {
    const label = typeof raw.scenarioLabel === 'string' ? raw.scenarioLabel : 'Демо-сценарий';
    return {
      title: 'Демо-снимок',
      subtitle: label,
      leadsInSvod: leads,
      dealsInSvod: deals,
      revenueLabel: rev,
      interpretation: 'Случайный сценарий для показа — каждый запуск демо генерирует новые цифры.',
    };
  }
  if (raw.source === 'csv_xlsx_upload' || raw.source === 'manual_demo') {
    return {
      title: typeof raw.note === 'string' ? 'Загрузка' : 'Таблица',
      subtitle: 'Свод в облаке',
      leadsInSvod: leads,
      dealsInSvod: deals,
      revenueLabel: rev,
      interpretation:
        'Показатели периода собраны из загруженных файлов и попали в единый снимок для решения.',
    };
  }
  return {
    title: 'Данные периода',
    subtitle: 'Сводные метрики',
    leadsInSvod: leads,
    dealsInSvod: deals,
    revenueLabel: rev,
    interpretation:
      'Цифры главного экрана отражают выбранный период; детали — в разделе «Разбор».',
  };
}

export function chainBottleneckStepId(
  rule: InsightRuleId | null,
  raw: Record<string, unknown>,
): 'attention' | 'leads' | 'deals' | 'money' | null {
  if (rule === 1) return 'deals';
  if (rule === 2) return 'leads';
  if (rule === 3) return 'money';
  if (rule === 4) return 'deals';
  if (rule === 5) return null;
  if (raw.source === 'instagram_pipeline' || raw.source === 'chrona_demo_preview') {
    return 'deals';
  }
  return 'deals';
}

export type FunnelStage = { label: string; count: number };

/** Diagnostic funnel copy for Breakdown; aligned with demo when packaged demo. */
export function buildFunnelBreakdown(
  row: ProcessedMetricsRow,
  raw: Record<string, unknown>,
  rule: InsightRuleId | null,
): { stages: FunnelStage[]; mainDrop: string } {
  const leads = Math.round(Number(row.leads) || 0);
  const deals = Math.round(Number(row.deals) || 0);

  if (isPackagedDemo(row, raw)) {
    const qualified = Math.max(deals, Math.min(Math.max(leads - 1, 0), Math.round(leads * 0.42)));
    const scenario = String(raw.scenario ?? '');
    const mainDropByScenario: Record<string, string> = {
      sales_bottleneck: 'Демо: много заявок, мало сделок — проверьте продажи и follow-up.',
      marketing_bottleneck: 'Демо: расход есть, лидов мало — проблема в верхней части воронки.',
      cash_gap: 'Демо: выручка в отчёте есть, кэш отстаёт — смотрите сроки оплат.',
      stable_growth: 'Демо: период ровный — можно точечно усилить лучший канал.',
    };
    return {
      stages: [
        { label: 'Заявки в периоде', count: leads },
        { label: 'Квалифицирующий контакт (оценка)', count: qualified },
        { label: 'Сделки', count: deals },
      ],
      mainDrop: mainDropByScenario[scenario] ?? 'Сверьте этапы с приоритетом периода на главном экране.',
    };
  }

  const qualified = Math.max(deals, Math.min(Math.max(leads - 1, 0), Math.round(leads * 0.45)));
  return {
    stages: [
      { label: 'Заявки в периоде', count: leads },
      { label: 'Прогресс к сделке (оценка по данным периода)', count: qualified },
      { label: 'Сделки', count: deals },
    ],
    mainDrop:
      rule === 1
        ? 'Низкая конверсия лида в сделку — фокус на середине воронки (продажи и follow-up).'
        : rule === 2
          ? 'Мало заявок относительно усилий — проверьте канал привлечения и первый контакт.'
          : rule === 3
            ? 'Выручка и кэш расходятся по срокам — приоритет на оплатах и дебиторке.'
            : 'Сравните этапы ниже с выбранным приоритетом периода.',
  };
}
