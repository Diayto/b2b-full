import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';
import { formatKZT } from '@/lib/metrics';
import type { InsightRuleId } from '@/lib/insightEngine';

/** Coherent demo narrative aligned with CHRONA_DEMO_PROCESSED_METRICS_ROW (42 leads, 5 deals). */
export const CHRONA_DEMO_INSTAGRAM_SIGNAL = {
  handle: '@chrona.service',
  followersLabel: '18,4 тыс.',
  reachLabel: '124 тыс.',
  engagementRateLabel: '4,2%',
  leadsAttributed: 28,
  interpretation:
    'Канал даёт охват и заявки; по данным периода основная потеря — после входа лида в продажи.',
} as const;

export const CHRONA_DEMO_TABLE_SIGNAL = {
  title: 'Сводная таблица',
  subtitle: 'Excel → облако',
  leadsInSvod: 42,
  dealsInSvod: 5,
  revenueLabel: '2,65 млн ₸',
  interpretation: 'Финансовый снимок и воронка сведены в одну строку периода для главного экрана.',
} as const;

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

function isPackagedDemo(row: ProcessedMetricsRow, raw: Record<string, unknown>): boolean {
  return raw.source === 'chrona_demo_preview' || raw.scenario === 'sales_bottleneck';
}

export function resolveInstagramSignal(
  row: ProcessedMetricsRow,
  raw: Record<string, unknown>,
): InstagramSourceSignal | null {
  if (isPackagedDemo(row, raw)) {
    return { ...CHRONA_DEMO_INSTAGRAM_SIGNAL };
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
  if (isPackagedDemo(row, raw)) {
    return { ...CHRONA_DEMO_TABLE_SIGNAL };
  }
  const leads = Math.round(Number(row.leads) || 0);
  const deals = Math.round(Number(row.deals) || 0);
  const rev = formatKZT(Number(row.revenue) || 0);
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
    const qualified = 18;
    return {
      stages: [
        { label: 'Заявки в периоде', count: leads },
        { label: 'Дошли до квалифицирующего разговора', count: qualified },
        { label: 'Сделки', count: deals },
      ],
      mainDrop:
        rule === 1 || rule === null
          ? 'Самый большой отвал — после заявки: до сделки доходит мало лидов при нормальном верхе воронки.'
          : 'Смотрите цепочку на главном экране и цифры ниже.',
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
