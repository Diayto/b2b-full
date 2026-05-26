import type { ProcessedMetricsRow } from '@/lib/supabaseMetrics';

export type DemoScenarioId = 'sales_bottleneck' | 'marketing_bottleneck' | 'cash_gap' | 'stable_growth';

const SCENARIO_LABELS: Record<DemoScenarioId, string> = {
  sales_bottleneck: 'Узкое место в продажах',
  marketing_bottleneck: 'Мало лидов при расходе',
  cash_gap: 'Выручка есть, кэш отрицательный',
  stable_growth: 'Стабильный период',
};

const CONTENT_POOL = [
  { id: 'video_23', title: 'Ошибки в CV' },
  { id: 'video_18', title: 'Как пройти собеседование' },
  { id: 'video_31', title: 'Стипендии 2026' },
  { id: 'video_12', title: 'История выпускника' },
  { id: 'video_05', title: 'День из жизни студента' },
  { id: 'video_41', title: '5 мифов о стажировках' },
  { id: 'video_09', title: 'Как написать мотивационное' },
  { id: 'video_55', title: 'Разбор отказа HR' },
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function ymdToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function ymdDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function buildMarketing(
  totalLeads: number,
  totalDeals: number,
  totalSpend: number,
  totalRevenue: number,
) {
  const igShare = 0.45 + Math.random() * 0.2;
  const adsShare = 0.25 + Math.random() * 0.15;
  const refShare = Math.max(0.05, 1 - igShare - adsShare);

  const igLeads = Math.max(1, Math.round(totalLeads * igShare));
  const adsLeads = Math.max(0, Math.round(totalLeads * adsShare));
  const refLeads = Math.max(0, totalLeads - igLeads - adsLeads);

  const igDeals = Math.max(0, Math.min(totalDeals, Math.round(totalDeals * 0.45)));
  const adsDeals = Math.max(0, Math.min(totalDeals - igDeals, Math.round(totalDeals * 0.35)));
  const refDeals = Math.max(0, totalDeals - igDeals - adsDeals);

  const igSpend = Math.round(totalSpend * (0.15 + Math.random() * 0.15));
  const adsSpend = Math.max(0, totalSpend - igSpend);

  const posts = shuffle(CONTENT_POOL).slice(0, 5);
  let leadBudget = totalLeads;
  const content = posts.map((p, i) => {
    const share = i === posts.length - 1 ? leadBudget : Math.max(0, Math.round(totalLeads * (0.12 + Math.random() * 0.12)));
    leadBudget = Math.max(0, leadBudget - share);
    const conv = share > 0 && Math.random() > 0.35 ? randInt(0, Math.min(2, totalDeals)) : 0;
    return {
      id: p.id,
      title: p.title,
      reach: randInt(28_000, 140_000),
      leads: share,
      conversions: conv,
    };
  });

  return {
    channels: [
      {
        name: 'Instagram organic',
        spend: igSpend,
        leads: igLeads,
        deals: igDeals,
        revenue: Math.round(totalRevenue * 0.35),
      },
      {
        name: 'Meta Ads',
        spend: adsSpend,
        leads: adsLeads,
        deals: adsDeals,
        revenue: Math.round(totalRevenue * 0.45),
      },
      {
        name: 'Referral',
        spend: 0,
        leads: refLeads,
        deals: refDeals,
        revenue: Math.round(totalRevenue * 0.2),
      },
    ],
    content,
    instagram: {
      handle: `@chrona.demo${randInt(10, 99)}`,
      followers: randInt(12_000, 28_000),
      reach: randInt(80_000, 160_000),
      engagement_rate: 2.8 + Math.random() * 2.5,
    },
  };
}

export function generateRandomDemoRow(scenarioId?: DemoScenarioId): ProcessedMetricsRow {
  const scenario = scenarioId ?? pick(['sales_bottleneck', 'marketing_bottleneck', 'cash_gap', 'stable_growth']);

  let spend: number;
  let leads: number;
  let deals: number;
  let revenue: number;
  let cashIn: number;
  let cashOut: number;

  switch (scenario) {
    case 'marketing_bottleneck':
      spend = randInt(480_000, 980_000);
      leads = randInt(2, 5);
      deals = randInt(0, 2);
      revenue = randInt(400_000, 1_200_000);
      cashIn = randInt(350_000, revenue);
      cashOut = randInt(500_000, 900_000);
      break;
    case 'cash_gap':
      spend = randInt(320_000, 620_000);
      leads = randInt(28, 48);
      deals = randInt(6, 11);
      revenue = randInt(2_200_000, 3_800_000);
      cashIn = randInt(1_400_000, revenue - 200_000);
      cashOut = cashIn + randInt(180_000, 520_000);
      break;
    case 'stable_growth':
      spend = randInt(280_000, 520_000);
      leads = randInt(26, 44);
      deals = randInt(9, 15);
      revenue = randInt(2_800_000, 4_200_000);
      cashIn = randInt(revenue * 0.85, revenue);
      cashOut = randInt(spend, cashIn - 100_000);
      break;
    case 'sales_bottleneck':
    default:
      spend = randInt(680_000, 1_050_000);
      leads = randInt(34, 58);
      deals = randInt(3, 7);
      while (leads > 0 && deals / leads >= 0.15) {
        deals = Math.max(2, deals - 1);
      }
      revenue = randInt(1_800_000, 3_200_000);
      cashIn = randInt(1_200_000, 2_000_000);
      cashOut = randInt(cashIn, cashIn + randInt(80_000, 380_000));
      break;
  }

  const netCash = cashIn - cashOut;
  const marketing = buildMarketing(leads, deals, spend, revenue);
  const periodDays = randInt(21, 35);

  return {
    id: `demo-${Date.now()}-${randInt(1000, 9999)}`,
    company_id: '00000000-0000-4000-a000-000000000002',
    period_start: ymdDaysAgo(periodDays),
    period_end: ymdToday(),
    spend,
    leads,
    deals,
    revenue,
    cash_inflow: cashIn,
    cash_outflow: cashOut,
    net_cash: netCash,
    raw_data: {
      source: 'chrona_demo_preview',
      scenario,
      scenarioLabel: SCENARIO_LABELS[scenario],
      marketing,
    },
    created_at: new Date().toISOString(),
  };
}

export function getDemoScenarioLabel(row: ProcessedMetricsRow): string | null {
  const raw = row.raw_data as Record<string, unknown> | null;
  if (typeof raw?.scenarioLabel === 'string') return raw.scenarioLabel;
  if (typeof raw?.scenario === 'string') {
    return SCENARIO_LABELS[raw.scenario as DemoScenarioId] ?? null;
  }
  return null;
}
