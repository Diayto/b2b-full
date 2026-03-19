import type {
  ChannelCampaign,
  Customer,
  Deal,
  DateRange,
  Invoice,
  Lead,
  MarketingSpend,
  PaymentTransaction,
  Manager,
} from '../types';
import type { AttributionResult, RevenueControlTowerModel } from './model';
import { buildRevenueControlTowerModel, resolveInvoiceOutstandingExact, resolvePaymentAttribution } from './model';
import { getTodayMidnight, isDateInRangeInclusive, getPreviousDateRange, isMonthOverlappingRange, isValidYmd } from './dateRange';

export type CalculationMode = 'exact' | 'fallback';

export interface CoverageMeta {
  total: number;
  exact: number;
  fallback: number;
  missingLinks?: Record<string, number>;
  notes?: string[];
}

export interface ValueKpi {
  value: number;
  isExact: boolean;
  calculationMode: CalculationMode;
  coverage: CoverageMeta;
}

export interface RatioKpi {
  value: number; // 0..1
  isExact: boolean;
  calculationMode: CalculationMode;
  coverage: CoverageMeta;
  notes?: string[];
}

export interface MoneyKpi {
  value: number;
  isExact: boolean;
  calculationMode: CalculationMode;
  coverage: CoverageMeta;
  notes?: string[];
}

export interface GrowthKpi {
  value: number | null; // can be null when previous period == 0
  isExact: boolean;
  calculationMode: CalculationMode;
  coverage: CoverageMeta;
  notes?: string[];
}

export interface ChannelCampaignRow {
  channelCampaignExternalId: string;
  channelCampaignName?: string;

  marketingSpend: number;
  leads: number;
  deals: number;
  wonDeals: number;
  paidRevenue: number;

  leadToDealConversion: number; // 0..1
  dealToPaidConversion: number; // 0..1

  cpl: number | null;
  costPerWonDeal: number | null;

  expectedInflow: number;
  overdueAmount: number;

  coverage: {
    paidAttribution: CoverageMeta;
  };
}

export interface FunnelDropOffResult {
  leads: number;
  deals: number;
  wonDeals: number;
  paidWonDeals: number;

  leadToDealRate: number;
  dealToWonRate: number;
  wonToPaidRate: number;

  dropOffLeadToDeal: number;
  dropOffDealToWon: number;
  dropOffWonToPaid: number;

  isExact: boolean;
  calculationMode: CalculationMode;
  notes?: string[];
}

export interface PriorityActionCandidate {
  id: string;
  area: 'revenue' | 'cashflow' | 'sales';
  priority: 'high' | 'medium' | 'low';
  type:
    | 'collect_overdue_invoice'
    | 'follow_up_unpaid_invoice'
    | 'reengage_stalled_deal'
    | 'prioritize_delayed_customer';
  targetExternalIds: string[];
  facts: string[];
}

export interface SalesCashPriorityInputs {
  stalledDeals: Array<{ dealExternalId: string; lastActivityDate?: string; overdueAmountLinked: number }>;
  unpaidInvoices: Array<{ invoiceExternalId?: string; customerExternalId?: string; invoiceDate: string; outstanding: number; dueDate?: string }>;
  overdueInvoices: Array<{ invoiceExternalId?: string; customerExternalId?: string; invoiceDate: string; dueDate: string; overdueAmount: number }>;
  delayedCustomers: Array<{ customerExternalId: string; overdueAmount: number; overdueInvoiceCount: number }>;
  priorityActionCandidates: PriorityActionCandidate[];
}

export interface InsightLayerInputSignals {
  funnelBottleneckStage: 'lead_to_deal' | 'deal_to_won' | 'won_to_paid';
  worstChannels: Array<{ channelCampaignExternalId: string; reason: string }>;
  topOverdueInvoices: Array<{ invoiceExternalId?: string; customerExternalId?: string; overdueAmount: number; dueDate?: string }>;
  stalledDealCount: number;
}

export interface RevenueControlTowerAnalytics {
  revenue: MoneyKpi;
  expectedInflow: MoneyKpi;
  overdueAmount: MoneyKpi;
  leadToDealConversion: RatioKpi;
  dealToPaidConversion: RatioKpi;
  paidRevenueBySource: {
    rows: ChannelCampaignRow[];
    unattributedPaidRevenue: number;
    coverage: {
      paidAttribution: CoverageMeta;
    };
  };
  cpl: MoneyKpi;
  cac: MoneyKpi;
  costPerWonDeal: MoneyKpi;
  growthRate: GrowthKpi;
  funnelDropOff: FunnelDropOffResult;
  bestWorstChannelsSummary: {
    bestByPaidRevenue: string[];
    worstByLeadToDealConversion: string[];
    worstByDealToPaidConversion: string[];
    worstByOverdueAmount: string[];
  };
  salesCashPriority: SalesCashPriorityInputs;
  insightSignals: InsightLayerInputSignals;
}

function safeDiv(n: number, d: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function computeMarketingSpendInRange(marketingSpend: MarketingSpend[], range: DateRange): number {
  // marketingSpend.month = YYYY-MM
  let total = 0;
  for (const s of marketingSpend) {
    if (!isMonthOverlappingRange(s.month, range)) continue;
    total += s.amount;
  }
  return total;
}

function computeMarketingSpendByChannel(marketingSpend: MarketingSpend[], range: DateRange): Map<string, number> {
  const by = new Map<string, number>();
  for (const s of marketingSpend) {
    if (!isMonthOverlappingRange(s.month, range)) continue;
    const key = s.channelCampaignExternalId;
    if (!key) continue;
    by.set(key, (by.get(key) ?? 0) + s.amount);
  }
  return by;
}

function computePaymentsInRange(payments: PaymentTransaction[], range: DateRange): PaymentTransaction[] {
  return payments.filter((p) => p.paymentDate && isDateInRangeInclusive(p.paymentDate, range) && p.amount > 0);
}

function computeOutstandingForInvoice(model: RevenueControlTowerModel, invoice: Invoice): { outstanding: number; isExact: boolean; notes: string[] } {
  const res = resolveInvoiceOutstandingExact(model, invoice);
  return { outstanding: res.outstanding, isExact: res.isExact, notes: res.notes };
}

function computeRevenueByAttribution(
  model: RevenueControlTowerModel,
  paymentsInRange: PaymentTransaction[]
): {
  paidRevenueByChannel: Map<string, number>;
  attributionExactCount: number;
  attributionFallbackCount: number;
  unattributedPaidRevenue: number;
} {
  const paidRevenueByChannel = new Map<string, number>();
  let attributionExactCount = 0;
  let attributionFallbackCount = 0;
  let unattributedPaidRevenue = 0;

  for (const p of paymentsInRange) {
    const attr = resolvePaymentAttribution(model, p);
    if (!attr.channelCampaignExternalId) {
      unattributedPaidRevenue += p.amount;
      if (attr.mode === 'fallback') attributionFallbackCount += 1;
      continue;
    }
    if (attr.mode === 'exact') attributionExactCount += 1;
    else attributionFallbackCount += 1;
    paidRevenueByChannel.set(
      attr.channelCampaignExternalId,
      (paidRevenueByChannel.get(attr.channelCampaignExternalId) ?? 0) + p.amount
    );
  }

  return { paidRevenueByChannel, attributionExactCount, attributionFallbackCount, unattributedPaidRevenue };
}

function computeDealPaidInPeriod(
  model: RevenueControlTowerModel,
  deal: Deal,
  range: DateRange
): { paid: boolean; isExact: boolean; usedFallback: boolean; paidAmount: number } {
  const invoicesLinkedByDeal = deal.dealExternalId
    ? model.invoicesByDealExternalId.get(deal.dealExternalId) ?? []
    : [];

  const paymentsInRange = model.payments.filter((p) => p.paymentDate && isDateInRangeInclusive(p.paymentDate, range));

  const paidAmountExact = (() => {
    if (invoicesLinkedByDeal.length === 0) return 0;
    const byInvoiceId = new Map<string, number>();
    for (const inv of invoicesLinkedByDeal) {
      if (!inv.invoiceExternalId) continue;
      byInvoiceId.set(inv.invoiceExternalId, 0);
    }
    for (const pay of paymentsInRange) {
      if (!pay.invoiceExternalId) continue;
      if (!byInvoiceId.has(pay.invoiceExternalId)) continue;
      byInvoiceId.set(pay.invoiceExternalId, (byInvoiceId.get(pay.invoiceExternalId) ?? 0) + pay.amount);
    }
    return Array.from(byInvoiceId.values()).reduce((s, x) => s + x, 0);
  })();

  if (paidAmountExact > 0) {
    return { paid: true, isExact: true, usedFallback: false, paidAmount: paidAmountExact };
  }

  // Fallback: use customerExternalId if available.
  if (!deal.customerExternalId) {
    return { paid: false, isExact: invoicesLinkedByDeal.length > 0, usedFallback: false, paidAmount: 0 };
  }

  const invoicesLinkedByCustomer = model.invoices.filter((inv) => inv.customerExternalId === deal.customerExternalId);
  let paidSum = 0;
  for (const inv of invoicesLinkedByCustomer) {
    if (!inv.invoiceExternalId) continue;
    const pays = paymentsInRange.filter((p) => p.invoiceExternalId === inv.invoiceExternalId);
    paidSum += pays.reduce((s, p) => s + p.amount, 0);
  }

  return { paid: paidSum > 0, isExact: false, usedFallback: paidSum > 0, paidAmount: paidSum };
}

export function calculateRevenueControlTowerAnalytics(input: {
  dateRange: DateRange;
  channelCampaigns: ChannelCampaign[];
  leads: Lead[];
  deals: Deal[];
  invoices: Invoice[];
  payments: PaymentTransaction[];
  customers: Customer[];
  marketingSpend: MarketingSpend[];
  managers: Manager[];
}): RevenueControlTowerAnalytics {
  const model = buildRevenueControlTowerModel(input);
  const range = input.dateRange;
  const today = getTodayMidnight();

  // ---------------------------
  // Revenue
  // ---------------------------
  const paymentsInRange = computePaymentsInRange(model.payments, range);
  const revenueValue = paymentsInRange.reduce((s, p) => s + p.amount, 0);
  const revenueCoverage: CoverageMeta = {
    total: paymentsInRange.length,
    exact: paymentsInRange.length,
    fallback: 0,
    missingLinks: {},
    notes: paymentsInRange.length === 0 ? ['Нет платежей в выбранном периоде.'] : undefined,
  };

  const revenue: MoneyKpi = {
    value: revenueValue,
    isExact: true,
    calculationMode: 'exact',
    coverage: revenueCoverage,
  };

  // ---------------------------
  // Expected inflow + Overdue
  // ---------------------------
  let expectedInflow = 0;
  let expectedInflowExactCount = 0;
  let expectedInflowFallbackCount = 0;
  const expectedNotes: string[] = [];

  let overdueAmount = 0;
  let overdueExactCount = 0;
  let overdueFallbackCount = 0;

  for (const inv of model.invoices) {
    if (inv.amount <= 0) continue;
    const { outstanding, isExact, notes } = computeOutstandingForInvoice(model, inv);
    if (outstanding <= 0) continue;

    const due = inv.dueDate && isValidYmd(inv.dueDate) ? new Date(inv.dueDate + 'T00:00:00') : null;
    const dueMissing = !due;

    if (!dueMissing && due) {
      if (isDateInRangeInclusive(inv.dueDate!, range) && outstanding > 0) {
        expectedInflow += outstanding;
        if (isExact) expectedInflowExactCount += 1;
        else expectedInflowFallbackCount += 1;
      }
      if (due.getTime() < today.getTime()) {
        overdueAmount += outstanding;
        if (isExact) overdueExactCount += 1;
        else overdueFallbackCount += 1;
      }
    } else {
      // Cannot reliably place into windows.
      if (inv.status === 'unpaid') expectedNotes.push(`Счет ${inv.invoiceExternalId ?? inv.id}: нет dueDate, он не попадает в expected/overdue окна.`);
    }

    void notes;
  }

  const expectedInflowKpi: MoneyKpi = {
    value: expectedInflow,
    isExact: expectedInflowFallbackCount === 0,
    calculationMode: expectedInflowFallbackCount === 0 ? 'exact' : 'fallback',
    coverage: {
      total: expectedInflowExactCount + expectedInflowFallbackCount,
      exact: expectedInflowExactCount,
      fallback: expectedInflowFallbackCount,
      notes: expectedNotes.length ? expectedNotes.slice(0, 3) : undefined,
    },
    notes: expectedNotes.length ? expectedNotes.slice(0, 2) : undefined,
  };

  const overdueKpi: MoneyKpi = {
    value: overdueAmount,
    isExact: overdueFallbackCount === 0,
    calculationMode: overdueFallbackCount === 0 ? 'exact' : 'fallback',
    coverage: {
      total: overdueExactCount + overdueFallbackCount,
      exact: overdueExactCount,
      fallback: overdueFallbackCount,
    },
  };

  // ---------------------------
  // Lead-to-Deal Conversion
  // ---------------------------
  const leadsInRange = model.leads.filter((l) => l.createdDate && isDateInRangeInclusive(l.createdDate, range));
  const leadIdSet = new Set(leadsInRange.map((l) => l.leadExternalId));

  const dealsInRange = model.deals.filter((d) => d.createdDate && isDateInRangeInclusive(d.createdDate, range));
  const dealsLinkedToLeads = dealsInRange.filter((d) => d.leadExternalId && leadIdSet.has(d.leadExternalId));

  const missingLeadLinksCount = dealsInRange.length - dealsLinkedToLeads.length;
  const leadDen = leadsInRange.length;
  const leadNum = dealsLinkedToLeads.length;
  const leadToDealConversionValue = clamp01(safeDiv(leadNum, leadDen));

  const leadToDealConversion: RatioKpi = {
    value: leadToDealConversionValue,
    isExact: missingLeadLinksCount === 0,
    calculationMode: missingLeadLinksCount === 0 ? 'exact' : 'fallback',
    coverage: {
      total: dealsInRange.length,
      exact: dealsLinkedToLeads.length,
      fallback: missingLeadLinksCount,
      missingLinks: missingLeadLinksCount > 0 ? { 'deal.leadExternalId': missingLeadLinksCount } : undefined,
    },
    notes:
      leadDen === 0
        ? ['Нет лидов с createdDate в выбранном периоде.']
        : missingLeadLinksCount > 0
          ? ['Часть сделок в периоде не связана с лидом: конверсия рассчитана по доступным связям.']
          : undefined,
  };

  // ---------------------------
  // Deal-to-Paid Conversion
  // ---------------------------
  const dealsForPaidConversion = dealsInRange;
  let paidDealsCount = 0;
  let fallbackPaidDealsCount = 0;
  let fallbackUsedDealsCount = 0;

  for (const deal of dealsForPaidConversion) {
    const res = computeDealPaidInPeriod(model, deal, range);
    if (res.paid) {
      paidDealsCount += 1;
      if (!res.isExact) fallbackPaidDealsCount += 1;
    }
    if (!res.isExact) fallbackUsedDealsCount += 1;
  }

  const dealToPaidConversionValue = clamp01(safeDiv(paidDealsCount, dealsForPaidConversion.length));
  const dealToPaidConversion: RatioKpi = {
    value: dealToPaidConversionValue,
    isExact: fallbackUsedDealsCount === 0,
    calculationMode: fallbackUsedDealsCount === 0 ? 'exact' : 'fallback',
    coverage: {
      total: dealsForPaidConversion.length,
      exact: dealsForPaidConversion.length - fallbackUsedDealsCount,
      fallback: fallbackUsedDealsCount,
      notes: fallbackPaidDealsCount > 0 ? [`В конверсию попали ${fallbackPaidDealsCount} сделки за счет fallback атрибуции.`] : undefined,
    },
    notes: dealsForPaidConversion.length === 0 ? ['Нет сделок с createdDate в выбранном периоде.'] : undefined,
  };

  // ---------------------------
  // Paid Revenue by Source (attribution)
  // ---------------------------
  const { paidRevenueByChannel, attributionExactCount, attributionFallbackCount, unattributedPaidRevenue } =
    computeRevenueByAttribution(model, paymentsInRange);

  const paidAttributionCoverage: CoverageMeta = {
    total: paymentsInRange.length,
    exact: attributionExactCount,
    fallback: attributionFallbackCount,
    missingLinks: undefined,
  };

  // Additional per-channel computed fields (leads/deals/won/pipeline + expected/overdue)
  const channelRows: ChannelCampaignRow[] = [];
  // Build channel rows using resolution via chain to keep it consistent.
  const leadsByLeadId = model.leadByExternalId;
  const dealById = model.dealByExternalId;

  const leadsCreatedInRangeByChannel = new Map<string, number>();
  for (const l of leadsInRange) {
    if (!l.channelCampaignExternalId) continue;
    leadsCreatedInRangeByChannel.set(l.channelCampaignExternalId, (leadsCreatedInRangeByChannel.get(l.channelCampaignExternalId) ?? 0) + 1);
  }

  const dealsInRangeByChannel = new Map<string, { deals: number; wonDeals: number; paidDeals: number }>();
  const channelExpectedInflow = new Map<string, number>();
  const channelOverdue = new Map<string, number>();

  // Expected/overdue attribution: invoice -> deal -> lead -> channel
  for (const inv of model.invoices) {
    const { outstanding, isExact } = computeOutstandingForInvoice(model, inv);
    if (outstanding <= 0) continue;

    if (!inv.dueDate || !isValidYmd(inv.dueDate)) continue;
    const due = inv.dueDate!;

    const dealExternalId = inv.dealExternalId;
    if (!dealExternalId) continue;
    const deal = dealById.get(dealExternalId);
    if (!deal || !deal.leadExternalId) continue;
    const lead = leadsByLeadId.get(deal.leadExternalId);
    if (!lead || !lead.channelCampaignExternalId) continue;

    const channel = lead.channelCampaignExternalId;
    if (isDateInRangeInclusive(due, range)) {
      channelExpectedInflow.set(channel, (channelExpectedInflow.get(channel) ?? 0) + outstanding);
      void isExact;
    }
    const dueDateObj = new Date(due + 'T00:00:00');
    if (dueDateObj.getTime() < today.getTime()) {
      channelOverdue.set(channel, (channelOverdue.get(channel) ?? 0) + outstanding);
    }
  }

  // Deals attribution: deal -> lead -> channel
  for (const deal of dealsInRange) {
    if (!deal.leadExternalId) continue;
    const lead = leadsByLeadId.get(deal.leadExternalId);
    if (!lead || !lead.channelCampaignExternalId) continue;
    const channel = lead.channelCampaignExternalId;

    const curr = dealsInRangeByChannel.get(channel) ?? { deals: 0, wonDeals: 0, paidDeals: 0 };
    curr.deals += 1;
    const wonInPeriod =
      deal.status === 'won'
        ? (deal.wonDate ? isDateInRangeInclusive(deal.wonDate, range) : true)
        : false;
    if (wonInPeriod) curr.wonDeals += 1;

    const paidRes = computeDealPaidInPeriod(model, deal, range);
    if (paidRes.paid) curr.paidDeals += 1;
    dealsInRangeByChannel.set(channel, curr);
  }

  for (const channelCampaign of input.channelCampaigns) {
    const channel = channelCampaign.channelCampaignExternalId;
    if (!channel) continue;

    const rowDeals = dealsInRangeByChannel.get(channel) ?? { deals: 0, wonDeals: 0, paidDeals: 0 };
    const leadsCount = leadsCreatedInRangeByChannel.get(channel) ?? 0;

    const paidRevenue = paidRevenueByChannel.get(channel) ?? 0;

    const leadToDealConversion = safeDiv(rowDeals.deals, leadsCount);
    const dealToPaidConversion = safeDiv(rowDeals.paidDeals, rowDeals.deals);

    // marketing spend (per channel) within range
    let marketingSpend = 0;
    for (const s of model.marketingSpend) {
      if (!s.channelCampaignExternalId) continue;
      if (s.channelCampaignExternalId !== channel) continue;
      if (!isMonthOverlappingRange(s.month, range)) continue;
      marketingSpend += s.amount;
    }

    const cpl = leadsCount > 0 ? marketingSpend / leadsCount : null;
    const costPerWonDeal = rowDeals.wonDeals > 0 ? marketingSpend / rowDeals.wonDeals : null;

    const expectedInflow = channelExpectedInflow.get(channel) ?? 0;
    const overdueAmountRow = channelOverdue.get(channel) ?? 0;

    const paidAttributionCoverageRow: CoverageMeta = {
      total: paymentsInRange.length,
      exact: attributionExactCount,
      fallback: attributionFallbackCount,
    };

    channelRows.push({
      channelCampaignExternalId: channel,
      channelCampaignName: channelCampaign.name,

      marketingSpend,
      leads: leadsCount,
      deals: rowDeals.deals,
      wonDeals: rowDeals.wonDeals,
      paidRevenue,

      leadToDealConversion: clamp01(leadToDealConversion),
      dealToPaidConversion: clamp01(dealToPaidConversion),

      cpl,
      costPerWonDeal,

      expectedInflow,
      overdueAmount: overdueAmountRow,

      coverage: {
        paidAttribution: paidAttributionCoverageRow,
      },
    });
  }

  // Order rows for later UI.
  channelRows.sort((a, b) => b.paidRevenue - a.paidRevenue);

  // ---------------------------
  // Overall CPL / CAC / Cost per won deal
  // ---------------------------
  const marketingSpendTotal = computeMarketingSpendInRange(model.marketingSpend, range);

  const leadsTotal = leadsInRange.length;
  const cplValue = leadsTotal > 0 ? marketingSpendTotal / leadsTotal : 0;
  const cpl: MoneyKpi = {
    value: cplValue,
    isExact: leadsTotal > 0,
    calculationMode: leadsTotal > 0 ? 'exact' : 'fallback',
    coverage: {
      total: leadsTotal,
      exact: leadsTotal,
      fallback: 0,
      notes: leadsTotal === 0 ? ['Нет лидов с createdDate в выбранном периоде.'] : undefined,
    },
    notes: leadsTotal === 0 ? 'CPL не может быть рассчитан без лидов в периоде.' : undefined,
  };

  // Customers acquired: prefer customers.startDate, fallback to earliest paid payment date
  const customersAcquiredExact = model.customers.filter(
    (c) => c.startDate && isDateInRangeInclusive(c.startDate, range)
  );

  const earliestPaidPaymentByCustomer = new Map<string, string>();
  // Build earliest paid payment date per customer using invoices->payments links.
  const paymentsInAllTime = model.payments.filter((p) => p.paymentDate && p.amount > 0);
  // Payments -> invoices -> customer
  for (const p of paymentsInAllTime) {
    if (!p.invoiceExternalId) continue;
    const inv = model.invoiceByInvoiceExternalId.get(p.invoiceExternalId);
    if (!inv) continue;
    const customerId = inv.customerExternalId;
    if (!customerId) continue;
    const date = p.paymentDate!;
    const prev = earliestPaidPaymentByCustomer.get(customerId);
    if (!prev) earliestPaidPaymentByCustomer.set(customerId, date);
    else if (date < prev) earliestPaidPaymentByCustomer.set(customerId, date);
  }

  const acquiredCustomerFallback = new Set<string>();
  for (const c of model.customers) {
    if (c.startDate && isDateInRangeInclusive(c.startDate, range)) continue;
    const earliest = earliestPaidPaymentByCustomer.get(c.customerExternalId);
    if (earliest && isDateInRangeInclusive(earliest, range)) {
      acquiredCustomerFallback.add(c.customerExternalId);
    }
  }

  const totalAcquiredCustomers = customersAcquiredExact.length + acquiredCustomerFallback.size;
  const cacValue = totalAcquiredCustomers > 0 ? marketingSpendTotal / totalAcquiredCustomers : 0;

  const cac: MoneyKpi = {
    value: cacValue,
    isExact: acquiredCustomerFallback.size === 0,
    calculationMode: acquiredCustomerFallback.size === 0 ? 'exact' : 'fallback',
    coverage: {
      total: totalAcquiredCustomers,
      exact: customersAcquiredExact.length,
      fallback: acquiredCustomerFallback.size,
      notes: acquiredCustomerFallback.size > 0 ? ['Некоторые “новые клиенты” определены по первой оплате, т.к. startDate отсутствует.'] : undefined,
    },
    notes: acquiredCustomerFallback.size > 0 ? 'CAC рассчитан с fallback по первой оплате.' : undefined,
  };

  // Won deals in period
  const wonDealsInPeriod = dealsInRange.filter((d) => d.status === 'won' && (d.wonDate ? isDateInRangeInclusive(d.wonDate, range) : true));
  const costPerWonDealValue = wonDealsInPeriod.length > 0 ? marketingSpendTotal / wonDealsInPeriod.length : 0;

  const costPerWonDeal: MoneyKpi = {
    value: costPerWonDealValue,
    isExact: wonDealsInPeriod.every((d) => d.wonDate !== undefined),
    calculationMode: wonDealsInPeriod.every((d) => d.wonDate !== undefined) ? 'exact' : 'fallback',
    coverage: {
      total: wonDealsInPeriod.length,
      exact: wonDealsInPeriod.filter((d) => d.wonDate !== undefined).length,
      fallback: wonDealsInPeriod.filter((d) => d.wonDate === undefined).length,
    },
    notes: wonDealsInPeriod.some((d) => !d.wonDate) ? 'Часть won-сделок не имеет wonDate, поэтому включена как “won в периоде” через статус.' : undefined,
  };

  // ---------------------------
  // Growth rate (Revenue)
  // ---------------------------
  const prevRange = getPreviousDateRange(range);
  const prevPaymentsInRange = computePaymentsInRange(model.payments, prevRange);
  const prevRevenue = prevPaymentsInRange.reduce((s, p) => s + p.amount, 0);
  const growthValue = prevRevenue > 0 ? (revenueValue - prevRevenue) / prevRevenue : null;

  const growthRate: GrowthKpi = {
    value: growthValue,
    isExact: true,
    calculationMode: 'exact',
    coverage: {
      total: 1,
      exact: 1,
      fallback: 0,
      notes: prevRevenue === 0 ? ['Предыдущий период: выручка = 0. Рост не рассчитан.'] : undefined,
    },
  };

  // ---------------------------
  // Funnel Drop-off
  // ---------------------------
  const leadsStageSet = new Set(leadsInRange.map((l) => l.leadExternalId));
  const dealsStageSet = dealsInRange.filter((d) => d.leadExternalId && leadsStageSet.has(d.leadExternalId));
  const wonDealsStageSet = dealsStageSet.filter((d) => d.status === 'won' && (d.wonDate ? isDateInRangeInclusive(d.wonDate, range) : true));

  let paidWonDealsCount = 0;
  for (const d of wonDealsStageSet) {
    const res = computeDealPaidInPeriod(model, d, range);
    if (res.paid) paidWonDealsCount++;
  }

  const funnelLeadToDealRate = clamp01(safeDiv(dealsStageSet.length, leadsStageSet.size));
  const funnelDealToWonRate = clamp01(safeDiv(wonDealsStageSet.length, dealsStageSet.length));
  const funnelWonToPaidRate = clamp01(safeDiv(paidWonDealsCount, wonDealsStageSet.length));

  const funnelDropOff: FunnelDropOffResult = {
    leads: leadsStageSet.size,
    deals: dealsStageSet.length,
    wonDeals: wonDealsStageSet.length,
    paidWonDeals: paidWonDealsCount,
    leadToDealRate: funnelLeadToDealRate,
    dealToWonRate: funnelDealToWonRate,
    wonToPaidRate: funnelWonToPaidRate,
    dropOffLeadToDeal: 1 - funnelLeadToDealRate,
    dropOffDealToWon: 1 - funnelDealToWonRate,
    dropOffWonToPaid: 1 - funnelWonToPaidRate,
    isExact: true,
    calculationMode: 'exact',
    notes:
      leadsStageSet.size === 0
        ? ['Нет лидов в периоде для построения воронки.']
        : wonDealsStageSet.length === 0
          ? ['Нет won-сделок в периоде, поэтому этап won->paid воронки будет пустым.']
          : undefined,
  };

  // ---------------------------
  // Best/Worst channel summaries
  // ---------------------------
  const bestByPaidRevenue = channelRows
    .filter((r) => r.paidRevenue > 0)
    .slice(0, 3)
    .map((r) => r.channelCampaignExternalId);

  const worstByLeadToDealConversion = channelRows
    .filter((r) => r.leads > 0 && r.deals !== 0)
    .sort((a, b) => a.leadToDealConversion - b.leadToDealConversion)
    .slice(0, 3)
    .map((r) => r.channelCampaignExternalId);

  const worstByDealToPaidConversion = channelRows
    .filter((r) => r.deals > 0)
    .sort((a, b) => a.dealToPaidConversion - b.dealToPaidConversion)
    .slice(0, 3)
    .map((r) => r.channelCampaignExternalId);

  const worstByOverdueAmount = channelRows
    .filter((r) => r.overdueAmount > 0)
    .sort((a, b) => b.overdueAmount - a.overdueAmount)
    .slice(0, 3)
    .map((r) => r.channelCampaignExternalId);

  // ---------------------------
  // Sales / Cash priority inputs
  // ---------------------------
  const stalledDealsThresholdDays = 30;
  const stalledDeals: Array<{ dealExternalId: string; lastActivityDate?: string; overdueAmountLinked: number }> = [];

  for (const deal of model.deals) {
    if (deal.status !== 'open') continue;
    if (!deal.lastActivityDate && !deal.expectedCloseDate) continue;
    const activityDateStr = deal.lastActivityDate ?? deal.expectedCloseDate!;
    if (!activityDateStr) continue;
    if (!isValidYmd(activityDateStr)) continue;
    const d = new Date(activityDateStr + 'T00:00:00');
    const ageDays = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays < stalledDealsThresholdDays) continue;

    // Linked overdue amount by deal -> invoices with overdue due date
    let overdueLinked = 0;
    const invs = model.invoicesByDealExternalId.get(deal.dealExternalId) ?? [];
    for (const inv of invs) {
      if (!inv.dueDate || !isValidYmd(inv.dueDate)) continue;
      if (!isDateInRangeInclusive(inv.dueDate, { from: '1900-01-01', to: '2100-01-01' })) continue;
      const due = new Date(inv.dueDate + 'T00:00:00');
      if (due.getTime() >= today.getTime()) continue;
      const out = computeOutstandingForInvoice(model, inv).outstanding;
      overdueLinked += out;
    }
    stalledDeals.push({
      dealExternalId: deal.dealExternalId,
      lastActivityDate: deal.lastActivityDate,
      overdueAmountLinked: overdueLinked,
    });
  }

  stalledDeals.sort((a, b) => b.overdueAmountLinked - a.overdueAmount);

  const unpaidInvoices: SalesCashPriorityInputs['unpaidInvoices'] = [];
  const overdueInvoices: SalesCashPriorityInputs['overdueInvoices'] = [];
  const delayedCustomersById = new Map<string, { overdueAmount: number; overdueInvoiceCount: number }>();

  for (const inv of model.invoices) {
    const out = computeOutstandingForInvoice(model, inv);
    if (out.outstanding <= 0) continue;

    const dueDate = inv.dueDate && isValidYmd(inv.dueDate) ? inv.dueDate : undefined;
    const isOverdue = dueDate ? new Date(dueDate + 'T00:00:00').getTime() < today.getTime() : false;

    unpaidInvoices.push({
      invoiceExternalId: inv.invoiceExternalId,
      customerExternalId: inv.customerExternalId,
      invoiceDate: inv.invoiceDate,
      outstanding: out.outstanding,
      dueDate,
    });

    if (isOverdue && dueDate) {
      overdueInvoices.push({
        invoiceExternalId: inv.invoiceExternalId,
        customerExternalId: inv.customerExternalId,
        invoiceDate: inv.invoiceDate,
        dueDate,
        overdueAmount: out.outstanding,
      });

      const c = inv.customerExternalId;
      if (c) {
        const prev = delayedCustomersById.get(c) ?? { overdueAmount: 0, overdueInvoiceCount: 0 };
        prev.overdueAmount += out.outstanding;
        prev.overdueInvoiceCount += 1;
        delayedCustomersById.set(c, prev);
      }
    }
  }

  unpaidInvoices.sort((a, b) => b.outstanding - a.outstanding);
  overdueInvoices.sort((a, b) => b.overdueAmount - a.overdueAmount);

  const delayedCustomers: SalesCashPriorityInputs['delayedCustomers'] = Array.from(delayedCustomersById.entries()).map(([customerExternalId, v]) => ({
    customerExternalId,
    overdueAmount: v.overdueAmount,
    overdueInvoiceCount: v.overdueInvoiceCount,
  }));
  delayedCustomers.sort((a, b) => b.overdueAmount - a.overdueAmount);

  const priorityActionCandidates: PriorityActionCandidate[] = [];
  for (const inv of overdueInvoices.slice(0, 4)) {
    priorityActionCandidates.push({
      id: `act_overdue_${inv.invoiceExternalId ?? inv.customerExternalId ?? 'x'}_${inv.dueDate}`,
      area: 'cashflow',
      priority: 'high',
      type: 'collect_overdue_invoice',
      targetExternalIds: [inv.invoiceExternalId ?? inv.customerExternalId ?? ''],
      facts: [`Просрочка до ${inv.dueDate}`, `Просроченная сумма: ${inv.overdueAmount}`],
    });
  }
  for (const deal of stalledDeals.slice(0, 3)) {
    priorityActionCandidates.push({
      id: `act_stalled_${deal.dealExternalId}`,
      area: 'sales',
      priority: 'medium',
      type: 'reengage_stalled_deal',
      targetExternalIds: [deal.dealExternalId],
      facts: [`Сделка без активности более ${stalledDealsThresholdDays} дней`, `Связанная просрочка по счетам: ${deal.overdueAmountLinked}`],
    });
  }
  for (const c of delayedCustomers.slice(0, 2)) {
    priorityActionCandidates.push({
      id: `act_customer_delayed_${c.customerExternalId}`,
      area: 'cashflow',
      priority: 'high',
      type: 'prioritize_delayed_customer',
      targetExternalIds: [c.customerExternalId],
      facts: [`Просроченных счетов: ${c.overdueInvoiceCount}`, `Сумма просрочки: ${c.overdueAmount}`],
    });
  }

  // ---------------------------
  // Insight-layer input signals
  // ---------------------------
  const funnelBottleneckStage =
    funnelDropOff.dropOffLeadToDeal >= funnelDropOff.dropOffDealToWon && funnelDropOff.dropOffLeadToDeal >= funnelDropOff.dropOffWonToPaid
      ? 'lead_to_deal'
      : funnelDropOff.dropOffDealToWon >= funnelDropOff.dropOffWonToPaid
        ? 'deal_to_won'
        : 'won_to_paid';

  const worstChannels: Array<{ channelCampaignExternalId: string; reason: string }> = [];
  for (const r of channelRows
    .filter((x) => (x.leads > 0 || x.deals > 0) && (x.overdueAmount > 0 || x.paidRevenue === 0))
    .sort((a, b) => (b.overdueAmount - a.overdueAmount) + (a.dealToPaidConversion - b.dealToPaidConversion) * 500000)
    .slice(0, 3)) {
    if (r.overdueAmount > 0) worstChannels.push({ channelCampaignExternalId: r.channelCampaignExternalId, reason: 'Высокая просрочка по счетам, связанная с источником.' });
    else worstChannels.push({ channelCampaignExternalId: r.channelCampaignExternalId, reason: 'Низкая конверсия в оплаченные деньги.' });
  }

  const topOverdueInvoices = overdueInvoices.slice(0, 5).map((x) => ({
    invoiceExternalId: x.invoiceExternalId,
    customerExternalId: x.customerExternalId,
    overdueAmount: x.overdueAmount,
    dueDate: x.dueDate,
  }));

  const insightSignals: InsightLayerInputSignals = {
    funnelBottleneckStage,
    worstChannels,
    topOverdueInvoices,
    stalledDealCount: stalledDeals.length,
  };

  const bestWorstChannelsSummary = {
    bestByPaidRevenue,
    worstByLeadToDealConversion,
    worstByDealToPaidConversion,
    worstByOverdueAmount,
  };

  return {
    revenue,
    expectedInflow: expectedInflowKpi,
    overdueAmount: overdueKpi,
    leadToDealConversion,
    dealToPaidConversion,
    paidRevenueBySource: {
      rows: channelRows,
      unattributedPaidRevenue,
      coverage: { paidAttribution: paidAttributionCoverage },
    },
    cpl,
    cac,
    costPerWonDeal,
    growthRate,
    funnelDropOff,
    bestWorstChannelsSummary,
    salesCashPriority: {
      stalledDeals: stalledDeals.slice(0, 8),
      unpaidInvoices: unpaidInvoices.slice(0, 10),
      overdueInvoices: overdueInvoices.slice(0, 10),
      delayedCustomers: delayedCustomers.slice(0, 6),
      priorityActionCandidates,
    },
    insightSignals,
  };
}

