// ============================================================
// BizPulse KZ — Sales/Cash Priorities + Lost Deals Analysis
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import ControlTowerKpiCard from '@/components/controltower/ControlTowerKpiCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MetricHelpIcon from '@/components/controltower/MetricHelpIcon';
import SectionHeader from '@/components/controltower/SectionHeader';
import RankedListItem from '@/components/controltower/RankedListItem';
import EmptyStateCard from '@/components/controltower/EmptyStateCard';
import { TrustBadge } from '@/components/controltower';
import RecommendationsCard from '@/components/RecommendationsCard';
import { buildRecommendations } from '@/lib/recommendations';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Bolt,
  Clock,
  DollarSign,
  LayoutGrid,
  XCircle,
} from 'lucide-react';
import type { DateRange } from '@/lib/types';
import {
  calculateRevenueControlTowerAnalytics,
  buildRevenueControlTowerModel,
  computeLostDealsAnalysis,
  computeSystemCompleteness,
  LOST_REASON_LABELS,
  STALLED_REASON_LABELS,
  resolveInvoiceOutstandingExact,
  isDateInRangeInclusive,
  isValidYmd,
  type StalledReason,
} from '@/lib/analytics';
import type { RevenueControlTowerAnalytics } from '@/lib/analytics/revenueControlTower';
import {
  getChannelCampaigns,
  getCustomers,
  getDeals,
  getInvoices,
  getLeads,
  getManagers,
  getMarketingSpend,
  getPayments,
  getUploads,
  getSession,
  getContentMetrics,
  seedDemoData,
} from '@/lib/store';
import { formatKZT } from '@/lib/metrics';

function formatDateRu(dateYmd?: string): string {
  if (!dateYmd) return '—';
  try {
    return new Date(dateYmd + 'T00:00:00').toLocaleDateString('ru-KZ');
  } catch {
    return dateYmd;
  }
}

const actionTypeLabelMap: Record<string, string> = {
  collect_overdue_invoice: 'Собрать просроченные оплаты',
  follow_up_unpaid_invoice: 'Напомнить по неоплаченным счетам',
  reengage_stalled_deal: 'Разморозить застрявшие сделки',
  prioritize_delayed_customer: 'Переопределить приоритет на клиентов с задержкой оплат',
};

export default function SalesCashPrioritiesPage() {
  const navigate = useNavigate();
  const session = getSession();

  const [dateRange, setDateRange] = useState<'30d' | '90d' | '180d' | 'all'>('180d');

  useEffect(() => {
    if (!session) navigate('/');
  }, [session, navigate]);

  const companyId = session?.companyId || '';

  const customers = useMemo(() => getCustomers(companyId), [companyId]);
  const invoices = useMemo(() => getInvoices(companyId), [companyId]);
  const marketingSpend = useMemo(() => getMarketingSpend(companyId), [companyId]);
  const payments = useMemo(() => getPayments(companyId), [companyId]);
  const channelCampaigns = useMemo(() => getChannelCampaigns(companyId), [companyId]);
  const leads = useMemo(() => getLeads(companyId), [companyId]);
  const deals = useMemo(() => getDeals(companyId), [companyId]);
  const managers = useMemo(() => getManagers(companyId), [companyId]);
  const uploads = useMemo(() => getUploads(companyId), [companyId]);
  const contentMetrics = useMemo(() => getContentMetrics(companyId), [companyId]);

  const analyticsRange: DateRange = useMemo(() => {
    if (dateRange !== 'all') {
      const now = new Date();
      const days = dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 180;
      const from = new Date(now);
      from.setDate(from.getDate() - days);
      return { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    }

    const candidates: string[] = [];
    for (const p of payments) if (p.paymentDate) candidates.push(p.paymentDate);
    for (const inv of invoices) {
      if (inv.invoiceDate) candidates.push(inv.invoiceDate);
      if (inv.dueDate) candidates.push(inv.dueDate);
    }
    for (const l of leads) if (l.createdDate) candidates.push(l.createdDate);
    for (const d of deals) if (d.createdDate) candidates.push(d.createdDate);
    for (const ms of marketingSpend) candidates.push(`${ms.month}-01`);

    const valid = candidates
      .filter((s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s))
      .map((s) => new Date(s + 'T00:00:00').getTime())
      .filter((t) => Number.isFinite(t));

    const now = new Date();
    const fallbackFrom = new Date(now);
    fallbackFrom.setDate(fallbackFrom.getDate() - 180);

    if (valid.length === 0) {
      return { from: fallbackFrom.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    }

    const minT = Math.min(...valid);
    const maxT = Math.max(...valid);
    return { from: new Date(minT).toISOString().split('T')[0], to: new Date(maxT).toISOString().split('T')[0] };
  }, [dateRange, payments, invoices, leads, deals, marketingSpend]);

  const analytics: RevenueControlTowerAnalytics = useMemo(
    () =>
      calculateRevenueControlTowerAnalytics({
        dateRange: analyticsRange,
        channelCampaigns,
        leads,
        deals,
        invoices,
        payments,
        customers,
        marketingSpend,
        managers,
      }),
    [analyticsRange, channelCampaigns, leads, deals, invoices, payments, customers, marketingSpend, managers]
  );

  const hasAnyData =
    channelCampaigns.length > 0 ||
    leads.length > 0 ||
    deals.length > 0 ||
    invoices.length > 0 ||
    payments.length > 0 ||
    marketingSpend.length > 0 ||
    uploads.length > 0;

  const channelNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const cc of channelCampaigns) m.set(cc.channelCampaignExternalId, cc.name);
    return m;
  }, [channelCampaigns]);

  const managerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mg of managers) m.set(mg.managerExternalId, mg.name);
    return m;
  }, [managers]);

  const recommendationItems = useMemo(
    () =>
      buildRecommendations({
        surface: 'sales_cash',
        analytics,
        channelNameById,
        formatMoney: formatKZT,
        maxItems: 3,
      }),
    [analytics, channelNameById]
  );

  // --- Model ---
  const model = useMemo(
    () =>
      buildRevenueControlTowerModel({
        channelCampaigns,
        leads,
        deals,
        invoices,
        payments,
        customers,
        marketingSpend,
        managers,
      }),
    [channelCampaigns, leads, deals, invoices, payments, customers, marketingSpend, managers]
  );

  // --- Period slice (all diagnostics must follow the selected range) ---
  const todayMidnight = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()), []);
  const todayTs = todayMidnight.getTime();

  const dealsInPeriod = useMemo(() => {
    return deals.filter((d) => d.createdDate && isDateInRangeInclusive(d.createdDate, analyticsRange));
  }, [deals, analyticsRange]);

  const leadsInPeriod = useMemo(() => {
    return leads.filter((l) => l.createdDate && isDateInRangeInclusive(l.createdDate, analyticsRange));
  }, [leads, analyticsRange]);

  const wonDealsStageSet = useMemo(() => {
    const leadsIdSet = new Set(leadsInPeriod.map((l) => l.leadExternalId));
    const dealsStage = dealsInPeriod.filter((d) => d.leadExternalId && leadsIdSet.has(d.leadExternalId));

    const won = dealsStage.filter((d) => {
      if (d.status !== 'won') return false;
      if (d.wonDate) return isDateInRangeInclusive(d.wonDate, analyticsRange);
      return true; // backward compatibility: won without wonDate is still in the stage
    });

    return new Set(won.map((d) => d.dealExternalId));
  }, [dealsInPeriod, leadsInPeriod, analyticsRange]);

  const invoicesInPeriod = useMemo(() => {
    return invoices.filter(
      (inv) => inv.dueDate && isValidYmd(inv.dueDate) && isDateInRangeInclusive(inv.dueDate, analyticsRange),
    );
  }, [invoices, analyticsRange]);

  const invoicedWonDealsCount = useMemo(() => {
    const set = new Set<string>();
    for (const inv of invoicesInPeriod) {
      if (!inv.dealExternalId) continue;
      if (wonDealsStageSet.has(inv.dealExternalId)) set.add(inv.dealExternalId);
    }
    return set.size;
  }, [invoicesInPeriod, wonDealsStageSet]);

  const avgDealValueInPeriod = useMemo(() => {
    const paidWon = analytics.funnelDropOff.paidWonDeals;
    if (paidWon <= 0) return undefined;
    if (!analytics.revenue.value || analytics.revenue.value <= 0) return undefined;
    return analytics.revenue.value / paidWon;
  }, [analytics.funnelDropOff.paidWonDeals, analytics.revenue.value]);

  type TrustLevel = 'exact' | 'fallback' | 'incomplete';

  const toTrustLevel = (score: number): TrustLevel => {
    if (score >= 80) return 'exact';
    if (score >= 50) return 'fallback';
    return 'incomplete';
  };

  const getInvoiceOutstanding = (() => {
    const cache = new Map<string, { outstanding: number; isExact: boolean }>();
    return (invoice: (typeof invoices)[number]): { outstanding: number; isExact: boolean } => {
      const key = invoice.invoiceExternalId ?? invoice.id;
      const cached = cache.get(key);
      if (cached) return cached;
      const res = resolveInvoiceOutstandingExact(model, invoice);
      const next = { outstanding: res.outstanding, isExact: res.isExact };
      cache.set(key, next);
      return next;
    };
  })();

  // --- Unified "why money is not reaching payment" rows ---
  type MoneyLeakageRow = {
    id: string;
    entityType: 'deal' | 'invoice' | 'customer';
    dealExternalId?: string;
    invoiceExternalId?: string;
    customerExternalId?: string;
    problemStage: string;
    reason: string;
    amountAtRisk: number | null;
    trust: TrustLevel;
    owner: string;
    lastActivity?: string;
    recommendedNextAction: string;
  };

  const moneyLeakageRows = useMemo<MoneyLeakageRow[]>(() => {
    if (!dealsInPeriod.length && !invoicesInPeriod.length) return [];

    const rows: MoneyLeakageRow[] = [];
    const average = avgDealValueInPeriod;

    const getManagerForDeal = (deal?: { managerExternalId?: string }) => {
      if (!deal?.managerExternalId) return '—';
      return managerNameById.get(deal.managerExternalId) ?? deal.managerExternalId ?? '—';
    };

    // LOST DEALS (created in period, status=lost)
    for (const d of dealsInPeriod) {
      if (d.status !== 'lost') continue;
      const linkedInvoices = model.invoicesByDealExternalId.get(d.dealExternalId) ?? [];
      const unpaidInWindow = linkedInvoices.filter(
        (inv) => inv.status === 'unpaid' && inv.dueDate && isValidYmd(inv.dueDate) && isDateInRangeInclusive(inv.dueDate, analyticsRange),
      );

      let outstandingSum = 0;
      let allExact = true;
      for (const inv of unpaidInWindow) {
        const out = getInvoiceOutstanding(inv);
        outstandingSum += out.outstanding;
        allExact = allExact && out.isExact;
      }

      const amount = outstandingSum > 0 ? outstandingSum : average ?? null;
      const trust: TrustLevel = outstandingSum > 0 ? (allExact ? 'exact' : 'fallback') : amount !== null ? 'fallback' : 'incomplete';

      rows.push({
        id: `lost_${d.dealExternalId}`,
        entityType: 'deal',
        dealExternalId: d.dealExternalId,
        customerExternalId: d.customerExternalId ?? '—',
        problemStage: 'Потеря: сделка lost',
        reason: LOST_REASON_LABELS[d.lostReason ?? 'other'] ?? d.lostReason ?? '—',
        amountAtRisk: amount,
        trust,
        owner: getManagerForDeal(d),
        lastActivity: d.lostDate ?? d.lastActivityDate ?? d.createdDate,
        recommendedNextAction: 'Разобрать причину потерь и скорректировать оффер/скрипт',
      });
    }

    // STALLED DEALS (created in period, open, stalled by last activity age)
    const STALLED_THRESHOLD_DAYS = 14;
    for (const d of dealsInPeriod) {
      if (d.status !== 'open') continue;
      const activityYmd = d.lastActivityDate ?? d.expectedCloseDate;
      if (!activityYmd || !isValidYmd(activityYmd)) continue;
      if (!isDateInRangeInclusive(activityYmd, analyticsRange)) continue;

      const activityTs = new Date(activityYmd + 'T00:00:00').getTime();
      const ageDays = Math.max(0, Math.floor((todayTs - activityTs) / 86_400_000));
      if (ageDays < STALLED_THRESHOLD_DAYS) continue;

      const linkedInvoices = model.invoicesByDealExternalId.get(d.dealExternalId) ?? [];
      const unpaidInWindow = linkedInvoices.filter(
        (inv) => inv.status === 'unpaid' && inv.dueDate && isValidYmd(inv.dueDate) && isDateInRangeInclusive(inv.dueDate, analyticsRange),
      );

      let outstandingSum = 0;
      let allExact = true;
      for (const inv of unpaidInWindow) {
        const out = getInvoiceOutstanding(inv);
        outstandingSum += out.outstanding;
        allExact = allExact && out.isExact;
      }

      const amount = outstandingSum > 0 ? outstandingSum : average ?? null;
      const trust: TrustLevel = outstandingSum > 0 ? (allExact ? 'exact' : 'fallback') : amount !== null ? 'fallback' : 'incomplete';

      const stalledReasonKey = d.stalledReason as unknown as keyof typeof STALLED_REASON_LABELS;
      const stalledReasonLabel =
        (stalledReasonKey && STALLED_REASON_LABELS[stalledReasonKey as StalledReason]) ||
        STALLED_REASON_LABELS.other;

      rows.push({
        id: `stalled_${d.dealExternalId}`,
        entityType: 'deal',
        dealExternalId: d.dealExternalId,
        customerExternalId: d.customerExternalId ?? '—',
        problemStage: 'Задержка: застрявшая сделка',
        reason: stalledReasonLabel === STALLED_REASON_LABELS.other ? `Нет активности (${ageDays} дн.)` : stalledReasonLabel,
        amountAtRisk: amount,
        trust,
        owner: getManagerForDeal(d),
        lastActivity: d.lastActivityDate ?? d.expectedCloseDate,
        recommendedNextAction: actionTypeLabelMap.reengage_stalled_deal,
      });
    }

    // WON but NOT INVOICED IN WINDOW (won in period, status=won)
    for (const d of dealsInPeriod) {
      if (d.status !== 'won') continue;
      if (d.wonDate && !isDateInRangeInclusive(d.wonDate, analyticsRange)) continue;
      const linkedInvoices = model.invoicesByDealExternalId.get(d.dealExternalId) ?? [];
      const hasInvoiceInWindow = linkedInvoices.some(
        (inv) => inv.dueDate && isValidYmd(inv.dueDate) && isDateInRangeInclusive(inv.dueDate, analyticsRange),
      );
      if (hasInvoiceInWindow) continue;

      rows.push({
        id: `won_not_invoiced_${d.dealExternalId}`,
        entityType: 'deal',
        dealExternalId: d.dealExternalId,
        customerExternalId: d.customerExternalId ?? '—',
        problemStage: 'Сделка выиграна, счёт не выставлен (в периоде)',
        reason: 'Нет выставленного счёта в выбранном окне',
        amountAtRisk: average ?? null,
        trust: average ? 'fallback' : 'incomplete',
        owner: getManagerForDeal(d),
        lastActivity: d.wonDate ?? d.lastActivityDate ?? d.createdDate,
        recommendedNextAction: 'Выставить счёт по сделке',
      });
    }

    // INVOICED but UNPAID (not overdue)
    for (const inv of invoicesInPeriod) {
      if (inv.status !== 'unpaid') continue;
      const dueTs = inv.dueDate ? new Date(inv.dueDate + 'T00:00:00').getTime() : NaN;
      if (!Number.isFinite(dueTs)) continue;
      if (dueTs < todayTs) continue; // overdue is handled next

      const out = getInvoiceOutstanding(inv);
      const deal = inv.dealExternalId ? model.dealByExternalId.get(inv.dealExternalId) : undefined;
      const owner = getManagerForDeal(deal);

      rows.push({
        id: `invoiced_unpaid_${inv.invoiceExternalId ?? inv.id}`,
        entityType: 'invoice',
        invoiceExternalId: inv.invoiceExternalId ?? inv.id,
        customerExternalId: inv.customerExternalId ?? '—',
        dealExternalId: inv.dealExternalId,
        problemStage: 'Счёт выставлен, оплата не поступила',
        reason: 'Не оплачено в срок',
        amountAtRisk: out.outstanding > 0 ? out.outstanding : inv.amount > 0 ? inv.amount : null,
        trust: out.outstanding > 0 ? (out.isExact ? 'exact' : 'fallback') : 'incomplete',
        owner,
        lastActivity: inv.invoiceDate ?? inv.dueDate,
        recommendedNextAction: actionTypeLabelMap.follow_up_unpaid_invoice,
      });
    }

    // OVERDUE (in-window overdue)
    const overdueRows: MoneyLeakageRow[] = [];
    for (const inv of invoicesInPeriod) {
      if (inv.status !== 'unpaid') continue;
      const dueTs = inv.dueDate ? new Date(inv.dueDate + 'T00:00:00').getTime() : NaN;
      if (!Number.isFinite(dueTs)) continue;
      if (dueTs >= todayTs) continue;

      const out = getInvoiceOutstanding(inv);
      const daysOver = Math.floor((todayTs - dueTs) / 86_400_000);
      const deal = inv.dealExternalId ? model.dealByExternalId.get(inv.dealExternalId) : undefined;
      const owner = getManagerForDeal(deal);

      overdueRows.push({
        id: `overdue_${inv.invoiceExternalId ?? inv.id}`,
        entityType: 'invoice',
        invoiceExternalId: inv.invoiceExternalId ?? inv.id,
        customerExternalId: inv.customerExternalId ?? '—',
        dealExternalId: inv.dealExternalId,
        problemStage: 'Просрочка: оплата не поступила',
        reason: `Просрочка ${daysOver} дн.`,
        amountAtRisk: out.outstanding > 0 ? out.outstanding : inv.amount > 0 ? inv.amount : null,
        trust: out.outstanding > 0 ? (out.isExact ? 'exact' : 'fallback') : 'incomplete',
        owner,
        lastActivity: inv.dueDate ?? inv.invoiceDate,
        recommendedNextAction: actionTypeLabelMap.collect_overdue_invoice,
      });
    }
    rows.push(...overdueRows);

    // DELAYED customers (group overdue invoices in-window)
    const overdueByCustomer = new Map<string, { total: number; count: number; maxRow: MoneyLeakageRow | null }>();
    for (const r of overdueRows) {
      const cid = r.customerExternalId ?? '—';
      if (!overdueByCustomer.has(cid)) {
        overdueByCustomer.set(cid, { total: 0, count: 0, maxRow: r });
      }
      const prev = overdueByCustomer.get(cid)!;
      if (r.amountAtRisk !== null) prev.total += r.amountAtRisk;
      prev.count += 1;
      if (!prev.maxRow || (r.amountAtRisk ?? 0) > (prev.maxRow.amountAtRisk ?? 0)) prev.maxRow = r;
    }

    for (const [cid, data] of overdueByCustomer.entries()) {
      rows.push({
        id: `delayed_customer_${cid}`,
        entityType: 'customer',
        customerExternalId: cid,
        problemStage: 'Задержка клиента (несколько просрочек)',
        reason: `${data.count} просроченных счёта(ов) в периоде`,
        amountAtRisk: data.total > 0 ? data.total : null,
        trust: data.total > 0 ? 'exact' : 'incomplete',
        owner: data.maxRow?.owner ?? '—',
        lastActivity: data.maxRow?.lastActivity,
        recommendedNextAction: actionTypeLabelMap.prioritize_delayed_customer,
      });
    }

    // Sort by risk amount desc (unknown at end)
    return rows.sort((a, b) => (b.amountAtRisk ?? -1) - (a.amountAtRisk ?? -1));
  }, [
    dealsInPeriod,
    invoicesInPeriod,
    analyticsRange,
    model,
    managerNameById,
    avgDealValueInPeriod,
    todayTs,
  ]);

  // Compatibility layer for existing UI cards
  const lowerFunnelStageData = useMemo(() => {
    return {
      deal: analytics.funnelDropOff.deals,
      won: analytics.funnelDropOff.wonDeals,
      invoiced: invoicedWonDealsCount,
      paid: analytics.funnelDropOff.paidWonDeals,
    };
  }, [analytics.funnelDropOff.deals, analytics.funnelDropOff.wonDeals, analytics.funnelDropOff.paidWonDeals, invoicedWonDealsCount]);

  const periodOverdueInvoices = useMemo(() => {
    return moneyLeakageRows
      .filter((r) => r.entityType === 'invoice' && r.problemStage.startsWith('Просрочка'))
      .map((r) => ({
        invoiceExternalId: r.invoiceExternalId,
        customerExternalId: r.customerExternalId,
        dueDate: r.lastActivity,
        overdueAmount: r.amountAtRisk ?? 0,
      }));
  }, [moneyLeakageRows]);

  const periodUnpaidInvoices = useMemo(() => {
    return moneyLeakageRows
      .filter((r) => r.entityType === 'invoice' && r.problemStage.includes('оплата не поступила'))
      .map((r) => ({
        invoiceExternalId: r.invoiceExternalId,
        customerExternalId: r.customerExternalId,
        invoiceDate: r.lastActivity ?? '',
        outstanding: r.amountAtRisk ?? 0,
        dueDate: undefined as string | undefined,
      }));
  }, [moneyLeakageRows]);

  const periodStalledDeals = useMemo(() => {
    return moneyLeakageRows
      .filter((r) => r.entityType === 'deal' && r.problemStage.startsWith('Задержка'))
      .map((r) => ({
        dealExternalId: r.dealExternalId ?? '',
        lastActivityDate: r.lastActivity,
        overdueAmountLinked: r.amountAtRisk ?? 0,
      }))
      .filter((d) => d.dealExternalId);
  }, [moneyLeakageRows]);

  const periodDelayedCustomers = useMemo(() => {
    const byCustomer = new Map<string, { overdueAmount: number; overdueInvoiceCount: number }>();
    for (const inv of periodOverdueInvoices) {
      const cid = inv.customerExternalId ?? '—';
      const prev = byCustomer.get(cid) ?? { overdueAmount: 0, overdueInvoiceCount: 0 };
      prev.overdueAmount += inv.overdueAmount;
      prev.overdueInvoiceCount += 1;
      byCustomer.set(cid, prev);
    }

    return Array.from(byCustomer.entries()).map(([customerExternalId, v]) => ({
      customerExternalId,
      overdueAmount: v.overdueAmount,
      overdueInvoiceCount: v.overdueInvoiceCount,
    }));
  }, [periodOverdueInvoices]);

  const overdueInvoicesCount = periodOverdueInvoices.length;
  const unpaidInvoicesCount = periodUnpaidInvoices.length;

  const leakage = useMemo(() => {
    // Create period-aware leakage summary from unified rows.
    const totalItems = moneyLeakageRows.length;
    const totalEstimatedLoss = moneyLeakageRows.reduce((sum, r) => sum + (r.amountAtRisk ?? 0), 0);

    const categoryLabel = (stage: string) => {
      if (stage.startsWith('Потеря')) return 'Потерянные сделки';
      if (stage.startsWith('Задержка: застрявшая')) return 'Замершие сделки';
      if (stage.includes('выиграна')) return 'Выиграна, но нет счёта';
      if (stage.includes('Счёт выставлен') && stage.includes('оплата')) return 'Счета без оплаты';
      if (stage.startsWith('Просрочка')) return 'Просрочка оплаты';
      if (stage.startsWith('Задержка клиента')) return 'Задержка клиентов';
      return 'Прочее';
    };

    const catMap = new Map<string, { count: number; estimatedLoss: number }>();
    for (const r of moneyLeakageRows) {
      const label = categoryLabel(r.problemStage);
      const prev = catMap.get(label) ?? { count: 0, estimatedLoss: 0 };
      prev.count += 1;
      prev.estimatedLoss += r.amountAtRisk ?? 0;
      catMap.set(label, prev);
    }

    const byCategory = Array.from(catMap.entries())
      .map(([label, v]) => ({
        category: label,
        label,
        count: v.count,
        estimatedLoss: v.estimatedLoss,
        percentage: totalItems > 0 ? (v.count / totalItems) * 100 : 0,
      }))
      .sort((a, b) => b.estimatedLoss - a.estimatedLoss);

    return { totalItems, totalEstimatedLoss, byCategory };
  }, [moneyLeakageRows]);

  const lostDealsInPeriod = useMemo(() => dealsInPeriod.filter((d) => d.status === 'lost'), [dealsInPeriod]);

  const lostDealsAnalysis = useMemo(() => computeLostDealsAnalysis(lostDealsInPeriod, managers), [lostDealsInPeriod, managers]);

  const completeness = useMemo(
    () =>
      computeSystemCompleteness({
        leads,
        deals,
        invoices,
        payments,
        marketingSpend,
        channelCampaigns,
        contentMetrics,
      }),
    [leads, deals, invoices, payments, marketingSpend, channelCampaigns, contentMetrics]
  );

  const hasWeakLinkage =
    completeness.areas.some((a) => a.area === 'payment_linkage' && a.score < 80) ||
    completeness.areas.some((a) => a.area === 'sales_funnel' && a.score < 80);

  const handleSeedDemo = () => {
    if (!companyId) return;
    seedDemoData(companyId);
    window.location.reload();
  };

  if (!session) return null;

  return (
    <AppLayout>
      <div className="rct-page p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="rct-page-title">Где застряли деньги</h1>
            <p className="rct-body-micro text-muted-foreground mt-1">
              Где выручка "застревает" и какие действия нужны в первую очередь.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">30 дней</SelectItem>
                <SelectItem value="90d">90 дней</SelectItem>
                <SelectItem value="180d">180 дней</SelectItem>
                <SelectItem value="all">Всё время</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => navigate('/uploads')}>Загрузки</Button>
            <Button variant="outline" onClick={() => navigate('/marketing')}>Маркетинг</Button>
          </div>
        </div>

        {!hasAnyData ? (
          <EmptyStateCard
            title="Нет данных для приоритетов"
            description="Нужна цепочка: маркетинг → лиды → сделки → счета → оплаты."
            ctaLabel="Демо-данные"
            onCta={handleSeedDemo}
            secondaryCtaLabel="Перейти в Загрузки"
            onSecondaryCta={() => navigate('/uploads')}
          />
        ) : (
          <>
            {/* Top summary KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <ControlTowerKpiCard
                title="Застрявшие сделки"
                value={String(periodStalledDeals.length)}
                subtitle="без активности"
                status={periodStalledDeals.length > 0 ? 'warning' : 'success'}
                icon={<Clock className="h-5 w-5" />}
              />
              <ControlTowerKpiCard
                title="Неоплаченные счета"
                value={String(unpaidInvoicesCount)}
                subtitle="ожидают оплаты"
                status={unpaidInvoicesCount > 0 ? 'warning' : 'success'}
                icon={<DollarSign className="h-5 w-5" />}
              />
              <ControlTowerKpiCard
                title="Просрочено"
                value={formatKZT(periodOverdueInvoices.reduce((s, x) => s + x.overdueAmount, 0))}
                subtitle={`${overdueInvoicesCount} счет(ов)`}
                status={overdueInvoicesCount > 0 ? 'danger' : 'success'}
                icon={<AlertTriangle className="h-5 w-5" />}
              />
              <ControlTowerKpiCard
                title="Клиенты с задержкой"
                value={String(periodDelayedCustomers.length)}
                subtitle="с проблемой оплаты"
                status={periodDelayedCustomers.length > 0 ? 'warning' : 'default'}
                icon={<LayoutGrid className="h-5 w-5" />}
              />
              <ControlTowerKpiCard
                title="Потерянные сделки"
                value={String(lostDealsAnalysis.total)}
                subtitle="статус: lost"
                status={lostDealsAnalysis.total > 0 ? 'warning' : 'success'}
                icon={<XCircle className="h-5 w-5" />}
              />
            </div>

            {/* Lower Funnel + Leakage */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="rct-card">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-foreground">Нижняя воронка: Сделка → Оплата</CardTitle>
                  <CardDescription>Здоровье цепочки перед оплатой (см. таблицу ниже)</CardDescription>
                </CardHeader>
                <CardContent>
                  {lowerFunnelStageData.won > 0 && lowerFunnelStageData.invoiced < lowerFunnelStageData.won * 0.5 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 rct-card-inset p-2.5">
                      Частичные данные: часть выигранных сделок не связана со счетами. Загрузите счета с dealExternalId для полной воронки.
                    </p>
                  )}
                  <div className="space-y-3">
                    {[
                      { label: 'Сделки', val: lowerFunnelStageData.deal },
                      { label: 'Выиграно', val: lowerFunnelStageData.won },
                      { label: 'Счёт выставлен', val: lowerFunnelStageData.invoiced },
                      { label: 'Оплачено', val: lowerFunnelStageData.paid },
                    ].map((s, i, arr) => {
                      const prev = i > 0 ? arr[i - 1].val : s.val;
                      const rate = prev > 0 ? ((s.val / prev) * 100).toFixed(1) : '—';
                      return (
                        <div key={s.label} className="flex items-center justify-between gap-3 rct-card-inset p-3">
                          <span className="text-sm font-medium text-foreground">{s.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{s.val}</span>
                            {i > 0 && <span className="text-xs text-muted-foreground">({rate}%)</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {hasWeakLinkage && (
                    <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                      Частичные данные: связь счёт→сделка или оплата→сделка неполная. Показатели могут быть приблизительными.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="rct-card border-l-[3px] border-l-amber-400/70">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Утечки в воронке
                  </CardTitle>
                  <CardDescription>Куда “протекает” выручка в периоде</CardDescription>
                </CardHeader>
                <CardContent>
                  {leakage.totalItems === 0 ? (
                    <p className="text-sm text-muted-foreground">Утечек не обнаружено — воронка в норме.</p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Всего: {leakage.totalItems} точек · ~{formatKZT(leakage.totalEstimatedLoss)} потерь
                      </p>
                      {(() => {
                        const top = leakage.byCategory.slice(0, 3);
                        const maxLoss = Math.max(1, ...top.map((x) => x.estimatedLoss));
                        return (
                          <div className="space-y-2">
                            {top.map((c) => {
                              const w = Math.round((c.estimatedLoss / maxLoss) * 100);
                              return (
                                <div key={c.category} className="rct-card-inset p-2.5">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-medium text-foreground">{c.label}</span>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-[10px]">{c.count}</Badge>
                                      <span className="text-xs font-semibold text-foreground whitespace-nowrap">{formatKZT(c.estimatedLoss)}</span>
                                    </div>
                                  </div>
                                  <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                                    <div
                                      className="h-full bg-amber-400/70 dark:bg-amber-500/60 rounded-full"
                                      style={{ width: `${w}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Left: Deals + Invoices */}
              <div className="space-y-6 xl:col-span-2">
                {/* Unified leakage command table */}
                <Card className="rct-card border-l-[4px] border-l-rose-400/70">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                      Почему деньги не доходят до оплаты
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Главная рабочая поверхность: место риска, причина, ответственный и следующий шаг.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {moneyLeakageRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">В выбранном периоде не найдено заметных точек риска.</p>
                    ) : (
                      <>
                        {/* Compact reason breakdown (derived from unified leakage model) */}
                        <div className="rct-card-inset p-3.5 mb-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">Почему деньги “не доходят”</p>
                              <p className="text-xs text-muted-foreground mt-1">Распределение причин по тем же точкам риска.</p>
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              top {Math.min(6, leakage.byCategory.length)}
                            </Badge>
                          </div>

                          <div className="mt-3 space-y-2">
                            {(() => {
                              const top = leakage.byCategory.slice(0, 6);
                              const maxLoss = Math.max(1, ...top.map((x) => x.estimatedLoss));
                              return top.map((c) => {
                                const w = Math.round((c.estimatedLoss / maxLoss) * 100);
                                return (
                                  <div key={c.category} className="space-y-1">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-xs font-medium text-foreground">{c.label}</span>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px]">{c.count}</Badge>
                                        <span className="text-xs font-semibold text-foreground whitespace-nowrap">{formatKZT(c.estimatedLoss)}</span>
                                      </div>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-rose-400/70 dark:bg-rose-500/60 rounded-full"
                                        style={{ width: `${w}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>

                        <div className="overflow-x-auto border rounded-lg">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Сущность</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Проблема (стадия)</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Причина</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Сумма в риске</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ответственный</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Последняя активность</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Следующий шаг</th>
                              </tr>
                            </thead>
                            <tbody>
                              {moneyLeakageRows.slice(0, 15).map((r) => (
                                <tr key={r.id} className="border-b border-border/30 hover:bg-muted/20 align-top">
                                  <td className="px-3 py-2">
                                    <div className="font-medium text-foreground truncate max-w-[160px]">
                                      {r.entityType === 'deal'
                                        ? `Сделка: ${r.dealExternalId ?? '—'}`
                                        : r.entityType === 'invoice'
                                          ? `Счёт: ${r.invoiceExternalId ?? '—'}`
                                          : `Клиент: ${r.customerExternalId ?? '—'}`}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-1 truncate max-w-[160px]">
                                      клиент: {r.customerExternalId ?? '—'}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="font-medium text-foreground">{r.problemStage}</div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="text-muted-foreground">{r.reason}</div>
                                  </td>
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-2">
                                      <div className="font-semibold text-foreground">
                                        {r.amountAtRisk === null ? '—' : formatKZT(r.amountAtRisk)}
                                      </div>
                                      <TrustBadge level={r.trust} size="xs" />
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]">{r.owner}</td>
                                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.lastActivity ? formatDateRu(r.lastActivity) : '—'}</td>
                                  <td className="px-3 py-2">
                                    <div className="text-muted-foreground">{r.recommendedNextAction}</div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {moneyLeakageRows.length > 15 && (
                          <p className="text-xs text-muted-foreground mt-2">Показаны первые 15 из {moneyLeakageRows.length} точек риска.</p>
                        )}

                        {/* quick explanation of trust */}
                        <p className="text-[11px] text-muted-foreground mt-3">
                          Значки <span className="font-medium text-foreground">Точные / По неполным связям / Неполные</span> показывают, что часть сумм может быть оценкой, если в периоде нет связанных счетов/оплат.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* ============================================= */}
                {/* LOST DEALS ANALYSIS                             */}
                {/* ============================================= */}
                <Card className="rct-card border-l-[3px] border-l-rose-400/70">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-rose-500" />
                      Анализ потерянных сделок
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Почему клиенты уходят: причины, стадии и ответственные.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {lostDealsAnalysis.total === 0 ? (
                      <p className="text-sm text-muted-foreground">Нет потерянных сделок в периоде — отлично!</p>
                    ) : (
                      <div className="space-y-3">
                        {/* Lost deals list */}
                        <div>
                          <p className="text-sm font-semibold text-foreground mb-2">
                            Топ потерянных сделок (lost)
                          </p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b bg-muted/30">
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Сделка</th>
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Клиент</th>
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Стадия</th>
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Причина</th>
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Менеджер</th>
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Дата</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lostDealsAnalysis.deals.slice(0, 8).map((d) => (
                                  <tr key={d.dealExternalId} className="border-b border-border/30 hover:bg-muted/20">
                                    <td className="px-3 py-2 font-medium text-foreground truncate max-w-[120px]">{d.dealExternalId}</td>
                                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">{d.customerExternalId}</td>
                                    <td className="px-3 py-2">
                                      <Badge variant="outline" className="text-[10px]">{d.lostStage}</Badge>
                                    </td>
                                    <td className="px-3 py-2">
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'text-[10px]',
                                          d.lostReason === 'price' && 'text-rose-600 dark:text-rose-400 border-rose-300/60',
                                          d.lostReason === 'competitor' && 'text-amber-600 dark:text-amber-400 border-amber-300/60',
                                        )}
                                      >
                                        {LOST_REASON_LABELS[d.lostReason] ?? d.lostReason}
                                      </Badge>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[100px]">{d.managerName}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{formatDateRu(d.lostDate)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {lostDealsAnalysis.total > 8 && (
                            <p className="text-xs text-muted-foreground mt-2">Показаны первые 8 из {lostDealsAnalysis.total}.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Stalled deals */}
                <Card className="rct-card hidden">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      Застрявшие сделки
                      <MetricHelpIcon helpKey="stalled_deals" />
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Сделки, которые теряют темп и ставят деньги под угрозу.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {true ? (
                      <p className="text-sm text-muted-foreground">
                        Застрявшие сделки уже учтены в таблице риска выше — смотрите “Причина” и “Следующий шаг”.
                      </p>
                    ) : (
                      (() => {
                        const today = new Date();
                        const todayTs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                        const bucketForDays = (daysLate: number) => {
                          if (daysLate <= 7) return '0-7 дней';
                          if (daysLate <= 14) return '8-14 дней';
                          if (daysLate <= 30) return '15-30 дней';
                          return '30+ дней';
                        };
                        const buckets = [
                          { label: '0-7 дней', min: 0, max: 7 },
                          { label: '8-14 дней', min: 8, max: 14 },
                          { label: '15-30 дней', min: 15, max: 30 },
                          { label: '30+ дней', min: 31, max: Infinity },
                        ];
                        const perBucket = buckets.map((b) => ({ label: b.label, count: 0, amount: 0 }));
                        const normalized = periodStalledDeals.map((d) => {
                          const ts = d.lastActivityDate ? new Date(d.lastActivityDate + 'T00:00:00').getTime() : NaN;
                          const ageDays = Number.isFinite(ts) ? Math.max(0, Math.floor((todayTs - ts) / 86_400_000)) : 0;
                          const label = bucketForDays(ageDays);
                          const bucketIdx = buckets.findIndex((b) => label === b.label);
                          return { ...d, ageDays, bucketIdx, bucketLabel: label };
                        });

                        for (const d of normalized) {
                          if (d.bucketIdx < 0) continue;
                          perBucket[d.bucketIdx].count += 1;
                          perBucket[d.bucketIdx].amount += d.overdueAmountLinked;
                        }

                        const listTop = normalized
                          .slice()
                          .sort((a, b) => b.overdueAmountLinked - a.overdueAmountLinked)
                          .slice(0, 10);
                        const maxAmount = Math.max(1, ...perBucket.map((b) => b.amount));

                        return (
                          <div className="space-y-4">
                            <div className="rct-card-inset p-3.5">
                              <p className="text-sm font-semibold text-foreground mb-2">По возрасту</p>
                              <div className="space-y-2">
                                {perBucket.map((b) => {
                                  const w = Math.round((b.amount / maxAmount) * 100);
                                  return (
                                    <div key={b.label} className="space-y-1">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs font-medium text-muted-foreground">{b.label}</span>
                                        <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                                          {b.count} · {formatKZT(b.amount)}
                                        </span>
                                      </div>
                                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-rose-400/70 dark:bg-rose-500/60 rounded-full" style={{ width: `${w}%` }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-2">
                              {listTop.map((d) => (
                                <div key={d.dealExternalId} className="rct-card-inset p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-foreground truncate">{d.dealExternalId}</p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        активность: {formatDateRu(d.lastActivityDate)} · {d.bucketLabel}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-semibold text-foreground whitespace-nowrap">{formatKZT(d.overdueAmountLinked)}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </CardContent>
                </Card>

                {/* Invoices */}
                <Card className="rct-card hidden">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      Неоплаченные и просроченные счета
                      <MetricHelpIcon helpKey="risk_flags" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      const overdueInvoices = periodOverdueInvoices;
                      const unpaidInvoices = periodUnpaidInvoices;
                      const delayedCustomers = periodDelayedCustomers;

                      const overdueTotal = overdueInvoices.reduce((s, x) => s + x.overdueAmount, 0);
                      const unpaidTotal = unpaidInvoices.reduce((s, x) => s + x.outstanding, 0);
                      const delayedTotal = delayedCustomers.reduce((s, x) => s + x.overdueAmount, 0);
                      const nonOverdueUnpaid = unpaidTotal; // unpaidInvoices уже исключают просрочку

                      const rankedOverdue = overdueInvoices
                        .slice()
                        .sort((a, b) => b.overdueAmount - a.overdueAmount)
                        .slice(0, 7);
                      const maxOverdue = Math.max(1, ...rankedOverdue.map((x) => x.overdueAmount));

                      return (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="rct-stat-box-amber">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Просрочка</div>
                              <div className="text-xl font-bold text-foreground mt-2">{formatKZT(overdueTotal)}</div>
                              <div className="text-xs text-muted-foreground mt-1">{overdueInvoices.length} счет(ов)</div>
                            </div>
                            <div className="rct-stat-box-slate">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Неоплачено</div>
                              <div className="text-xl font-bold text-foreground mt-2">{formatKZT(nonOverdueUnpaid)}</div>
                              <div className="text-xs text-muted-foreground mt-1">без просрочки</div>
                            </div>
                            <div className="rct-stat-box-emerald">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Задержка клиентов</div>
                              <div className="text-xl font-bold text-foreground mt-2">{formatKZT(delayedTotal)}</div>
                              <div className="text-xs text-muted-foreground mt-1">{delayedCustomers.length} клиентов</div>
                            </div>
                          </div>

                          {rankedOverdue.length > 0 && (
                            <div className="rct-card-inset p-3">
                              <p className="text-sm font-semibold text-foreground mb-2">Просроченные счета (топ)</p>
                              <div className="space-y-2">
                                {rankedOverdue.map((inv) => (
                                  <RankedListItem
                                    key={inv.invoiceExternalId ?? `${inv.customerExternalId}_${inv.dueDate}`}
                                    label={inv.invoiceExternalId ?? 'Счёт'}
                                    sublabel={`клиент: ${inv.customerExternalId ?? '—'} · due: ${formatDateRu(inv.dueDate)}`}
                                    value={formatKZT(inv.overdueAmount)}
                                    progressPct={Math.round((inv.overdueAmount / maxOverdue) * 100)}
                                    barColor="rose"
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>

              {/* Right column */}
              <div className="space-y-6">
                {/* Delayed customers */}
                <Card className="rct-card hidden">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      Клиенты с задержкой
                      <MetricHelpIcon helpKey="delayed_customers" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {periodDelayedCustomers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Нет клиентов с задержкой.</p>
                    ) : (
                      (() => {
                        const top = periodDelayedCustomers
                          .slice()
                          .sort((a, b) => b.overdueAmount - a.overdueAmount)
                          .slice(0, 8);
                        const max = Math.max(1, ...top.map((c) => c.overdueAmount));

                        return (
                          <div className="space-y-3">
                            {top.map((c) => (
                              <RankedListItem
                                key={c.customerExternalId}
                                label={c.customerExternalId}
                                sublabel={`${c.overdueInvoiceCount} просроченных`}
                                value={formatKZT(c.overdueAmount)}
                                progressPct={Math.round((c.overdueAmount / max) * 100)}
                                barColor="amber"
                              />
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </CardContent>
                </Card>

                {/* Top risks (diagnostics) */}
                <Card className="rct-card">
                  <CardHeader className="rct-card-padding pb-2">
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      Топ рисков в оплате
                      <MetricHelpIcon helpKey="priority_actions" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {moneyLeakageRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Нет точек риска в выбранном периоде.</p>
                    ) : (
                      <div className="space-y-2">
                        {moneyLeakageRows.slice(0, 3).map((r) => (
                          <div key={r.id} className="rct-card-inset p-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{r.problemStage}</p>
                                <div className="flex gap-2 mt-2 flex-wrap items-center">
                                  <Badge variant="outline" className="text-[10px]">
                                    {r.entityType}
                                  </Badge>
                                  <TrustBadge level={r.trust} size="xs" />
                                </div>
                              </div>
                              <Bolt className="h-4 w-4 text-primary mt-0.5" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">Причина: {r.reason}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recommendations at bottom */}
                <RecommendationsCard
                  title="Рекомендации"
                  description="Что делать дальше."
                  items={recommendationItems}
                  helpKey="priority_actions"
                  compact
                />
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
