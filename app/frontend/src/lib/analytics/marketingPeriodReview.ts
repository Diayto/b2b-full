// ============================================================
// Chrona — Marketing / executive period review (vs previous window)
// Для слоя отчётов: дельты и короткие выводы без дублирования тяжёлой аналитики.
// ============================================================

import type {
  ChannelCampaign,
  DateRange,
  Deal,
  Invoice,
  Lead,
  MarketingSpend,
  PaymentTransaction,
} from '../types';
import type { ContentMetric } from './domain';
import {
  getPreviousDateRange,
  isDateInRangeInclusive,
  isMonthOverlappingRange,
} from './dateRange';
import { computeStrategicNextSteps } from './strategicNextSteps';

export interface PeriodReviewMetrics {
  paidRevenue: number;
  marketingSpend: number;
  leadsCount: number;
  dealsCreatedCount: number;
  wonDealsCount: number;
}

export interface MarketingPeriodReviewInput {
  dateRange: DateRange;
  payments: PaymentTransaction[];
  marketingSpend: MarketingSpend[];
  leads: Lead[];
  deals: Deal[];
  /** Для хвоста «что сделать дальше» */
  invoices: Invoice[];
  channelCampaigns: ChannelCampaign[];
  contentMetrics: ContentMetric[];
}

export interface MarketingPeriodReview {
  range: DateRange;
  previousRange: DateRange;
  current: PeriodReviewMetrics;
  previous: PeriodReviewMetrics;
  deltas: {
    paidRevenuePct: number | null;
    marketingSpendPct: number | null;
    leadsPct: number | null;
    dealsCreatedPct: number | null;
    wonDealsPct: number | null;
  };
  narrativeBullets: string[];
}

function sumPaymentsInRange(payments: PaymentTransaction[], range: DateRange): number {
  let s = 0;
  for (const p of payments) {
    if (!p.paymentDate || !isDateInRangeInclusive(p.paymentDate, range)) continue;
    if (p.amount > 0) s += p.amount;
  }
  return s;
}

function sumMarketingSpendInRange(spend: MarketingSpend[], range: DateRange): number {
  let s = 0;
  for (const x of spend) {
    if (!x.month || !isMonthOverlappingRange(x.month, range)) continue;
    s += x.amount;
  }
  return s;
}

function countLeadsInRange(leads: Lead[], range: DateRange): number {
  let n = 0;
  for (const l of leads) {
    if (!l.createdDate || !isDateInRangeInclusive(l.createdDate, range)) continue;
    n++;
  }
  return n;
}

function countDealsCreatedInRange(deals: Deal[], range: DateRange): number {
  let n = 0;
  for (const d of deals) {
    if (!d.createdDate || !isDateInRangeInclusive(d.createdDate, range)) continue;
    n++;
  }
  return n;
}

function countWonDealsInRange(deals: Deal[], range: DateRange): number {
  let n = 0;
  for (const d of deals) {
    if (d.status !== 'won') continue;
    if (d.wonDate && isDateInRangeInclusive(d.wonDate, range)) {
      n++;
      continue;
    }
    if (!d.wonDate && d.createdDate && isDateInRangeInclusive(d.createdDate, range)) {
      n++;
    }
  }
  return n;
}

function pctDelta(curr: number, prev: number): number | null {
  if (!Number.isFinite(prev) || prev === 0) return null;
  return (curr - prev) / prev;
}

function metricsForRange(
  range: DateRange,
  payments: PaymentTransaction[],
  marketingSpend: MarketingSpend[],
  leads: Lead[],
  deals: Deal[],
): PeriodReviewMetrics {
  return {
    paidRevenue: sumPaymentsInRange(payments, range),
    marketingSpend: sumMarketingSpendInRange(marketingSpend, range),
    leadsCount: countLeadsInRange(leads, range),
    dealsCreatedCount: countDealsCreatedInRange(deals, range),
    wonDealsCount: countWonDealsInRange(deals, range),
  };
}

function buildNarrativeBullets(
  current: PeriodReviewMetrics,
  deltas: MarketingPeriodReview['deltas'],
  rangeLabel: string,
): string[] {
  const out: string[] = [];

  const fmtPct = (r: number | null) => (r === null ? null : `${(r * 100).toFixed(0)}%`);

  if (deltas.paidRevenuePct !== null) {
    const p = deltas.paidRevenuePct;
    if (p > 0.08) {
      out.push(`За ${rangeLabel} оплаченная выручка выросла на ${fmtPct(p)} к предыдущему окну.`);
    } else if (p < -0.08) {
      out.push(`За ${rangeLabel} выручка просела на ${fmtPct(Math.abs(p))} — проверьте оплаты и незакрытые счета в Sales/Cash.`);
    }
  }

  if (deltas.leadsPct !== null) {
    const p = deltas.leadsPct;
    if (p > 0.15) out.push(`Приток лидов ускорился (${fmtPct(p)}): оцените, какие источники дали прирост.`);
    if (p < -0.15) out.push(`Лидов стало заметно меньше (${fmtPct(p)}) — посмотрите каналы и органику на дашборде маркетинга.`);
  }

  if (deltas.marketingSpendPct !== null && deltas.paidRevenuePct !== null) {
    if (deltas.marketingSpendPct > 0.2 && (deltas.paidRevenuePct ?? 0) < 0) {
      out.push('Расходы выросли сильнее выручки — пересмотрите эффективность каналов и полноту данных.');
    }
  }

  if (current.wonDealsCount > 0 && current.paidRevenue === 0) {
    out.push('Есть выигранные сделки в периоде, но оплат в окне нет — возможна задержка счетов/оплат.');
  }

  if (current.marketingSpend === 0 && current.leadsCount > 0) {
    out.push('Лиды есть, расходы в периоде не попали в данные — ROI и CAC будут неполными (загрузите spend / свод).');
  }

  return out.slice(0, 4);
}

function rangeLabelRu(days: number): string {
  if (days <= 7) return 'неделю';
  if (days <= 31) return 'месяц';
  if (days <= 93) return 'квартал';
  return 'период';
}

function daysInRange(range: DateRange): number {
  const from = new Date(range.from + 'T12:00:00').getTime();
  const to = new Date(range.to + 'T12:00:00').getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 30;
  return Math.max(1, Math.round((to - from) / (86400 * 1000)) + 1);
}

/**
 * Сравнение текущего окна дат с предыдущим таким же по длине.
 */
export function computeMarketingPeriodReview(input: MarketingPeriodReviewInput): MarketingPeriodReview {
  const { dateRange, payments, marketingSpend, leads, deals, invoices, channelCampaigns, contentMetrics } =
    input;
  const previousRange = getPreviousDateRange(dateRange);

  const current = metricsForRange(dateRange, payments, marketingSpend, leads, deals);
  const previous = metricsForRange(previousRange, payments, marketingSpend, leads, deals);

  const deltas = {
    paidRevenuePct: pctDelta(current.paidRevenue, previous.paidRevenue),
    marketingSpendPct: pctDelta(current.marketingSpend, previous.marketingSpend),
    leadsPct: pctDelta(current.leadsCount, previous.leadsCount),
    dealsCreatedPct: pctDelta(current.dealsCreatedCount, previous.dealsCreatedCount),
    wonDealsPct: pctDelta(current.wonDealsCount, previous.wonDealsCount),
  };

  const label = rangeLabelRu(daysInRange(dateRange));
  const narrativeBullets = buildNarrativeBullets(current, deltas, label);

  const strategic = computeStrategicNextSteps({
    leads,
    deals,
    invoices,
    payments,
    marketingSpend,
    channelCampaigns,
    contentMetrics,
  });
  for (const s of strategic.slice(0, 2)) {
    if (narrativeBullets.length >= 5) break;
    narrativeBullets.push(`Дальше: ${s.title}${s.detail ? ` — ${s.detail}` : ''}`);
  }

  return {
    range: dateRange,
    previousRange,
    current,
    previous,
    deltas,
    narrativeBullets,
  };
}

/** Построить DateRange для последних N дней включительно (сегодня = to). */
export function rollingRangeDays(days: number): DateRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}
