// ============================================================
// BizPulse KZ — Executive Finance Dashboard
// Restructured: Critical Issues → Bottlenecks → Performance → Recommendations
// ============================================================

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  getSession,
  getCustomers,
  getInvoices,
  getMarketingSpend,
  getPayments,
  getChannelCampaigns,
  getLeads,
  getDeals,
  getManagers,
  seedDemoData,
  getUploads,
  getContentMetrics,
} from '@/lib/store';
import {
  formatKZT,
} from '@/lib/metrics';
import type { DateRange } from '@/lib/types';
import {
  calculateRevenueControlTowerAnalytics,
  buildRevenueControlTowerModel,
  computeUnifiedFunnel,
  computeLeakageAnalysis,
  computeSystemCompleteness,
  FUNNEL_STAGE_LABELS,
  explainOverdue,
  explainLeakage,
  explainCompleteness,
} from '@/lib/analytics';
import type { RevenueControlTowerAnalytics } from '@/lib/analytics/revenueControlTower';
import RecommendationsCard from '@/components/RecommendationsCard';
import { buildRecommendations } from '@/lib/recommendations';
import ControlTowerKpiCard from '@/components/controltower/ControlTowerKpiCard';
import type { KpiDelta } from '@/components/controltower/ControlTowerKpiCard';
import EmptyStateCard from '@/components/controltower/EmptyStateCard';
import SectionHeader from '@/components/controltower/SectionHeader';
import RankedListItem from '@/components/controltower/RankedListItem';
import { CollapsibleSection } from '@/components/controltower';
import { cn } from '@/lib/utils';
import {
  useChartTheme,
  buildAxisTick,
  buildTooltipStyle,
  buildLegendStyle,
  CHART_MARGIN,
  CHART_COLORS,
} from '@/lib/chartStyles';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, TrendingDown } from 'lucide-react';

const EMPTY_CHART_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/977836/2026-02-19/7965a3e5-68d6-4367-bc84-3890e3b4889b.png';

function percentFromRatio(r: number): string {
  if (!Number.isFinite(r)) return '—';
  return `${(r * 100).toFixed(1)}%`;
}

function moneyOrDash(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return formatKZT(value);
}

function formatGrowth(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function calculationBadge(mode: 'exact' | 'fallback'): string | null {
  return mode === 'fallback' ? 'по неполным связям' : null;
}

function getStageLabel(stage: RevenueControlTowerAnalytics['insightSignals']['funnelBottleneckStage']): string {
  switch (stage) {
    case 'lead_to_deal':
      return 'между лидом и сделкой';
    case 'deal_to_won':
      return 'между сделкой и выигранной сделкой';
    case 'won_to_paid':
      return 'между выигранной сделкой и оплатой';
    default:
      return 'в воронке';
  }
}

function makeGrowthDelta(value: number | null): KpiDelta | undefined {
  if (value === null || !Number.isFinite(value)) return undefined;
  return {
    value: `${(value * 100).toFixed(1)}%`,
    direction: value > 0 ? 'up' : value < 0 ? 'down' : 'flat',
    sentiment: value >= 0 ? 'positive' : 'negative',
  };
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const session = getSession();
  const [dateRange, setDateRange] = useState<'30d' | '90d' | '180d' | 'all'>('180d');
  const chartTheme = useChartTheme();

  useEffect(() => {
    if (!session) {
      navigate('/');
      return;
    }
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
      return {
        from: from.toISOString().split('T')[0],
        to: now.toISOString().split('T')[0],
      };
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
      return {
        from: fallbackFrom.toISOString().split('T')[0],
        to: now.toISOString().split('T')[0],
      };
    }

    const minT = Math.min(...valid);
    const maxT = Math.max(...valid);
    const from = new Date(minT).toISOString().split('T')[0];
    const to = new Date(maxT).toISOString().split('T')[0];
    return { from, to };
  }, [dateRange, payments, invoices, leads, deals, marketingSpend]);

  const analytics = useMemo((): RevenueControlTowerAnalytics => calculateRevenueControlTowerAnalytics({
    dateRange: analyticsRange,
    channelCampaigns,
    leads,
    deals,
    invoices,
    payments,
    customers,
    marketingSpend,
    managers,
  }), [analyticsRange, channelCampaigns, leads, deals, invoices, payments, customers, marketingSpend, managers]);

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

  const funnelStageData = useMemo(() => {
    const fd = analytics.funnelDropOff;
    const trafficCount = contentMetrics.length > 0
      ? contentMetrics.reduce((s, c) => s + c.reach, 0)
      : 0;
    const engagementCount = contentMetrics.length > 0
      ? contentMetrics.reduce((s, c) => s + c.likes + c.comments + c.saves + c.shares, 0)
      : 0;
    const invoicedCount = invoices.filter((inv) => {
      if (!inv.dealExternalId) return false;
      const deal = model.dealByExternalId.get(inv.dealExternalId);
      return deal?.status === 'won';
    }).length;
    return {
      traffic: { count: trafficCount, value: 0 },
      engagement: { count: engagementCount, value: 0 },
      lead: { count: fd.leads, value: 0 },
      deal: { count: fd.deals, value: 0 },
      won: { count: fd.wonDeals, value: 0 },
      invoiced: { count: invoicedCount, value: 0 },
      paid: { count: fd.paidWonDeals, value: analytics.revenue.value },
    };
  }, [analytics, contentMetrics, invoices, model]);

  const unifiedFunnel = useMemo(
    () => computeUnifiedFunnel(funnelStageData),
    [funnelStageData]
  );

  const leakage = useMemo(
    () =>
      computeLeakageAnalysis({
        model,
        contentMetrics,
        averageDealValue: analytics.revenue.value > 0 && analytics.funnelDropOff.paidWonDeals > 0
          ? analytics.revenue.value / analytics.funnelDropOff.paidWonDeals
          : undefined,
      }),
    [model, contentMetrics, analytics.revenue.value, analytics.funnelDropOff.paidWonDeals]
  );

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

  const heroChartData = useMemo(() => {
    const toMonthKey = (d: string) => {
      const dt = new Date(d + 'T00:00:00');
      if (!Number.isFinite(dt.getTime())) return '';
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    };

    const start = new Date(analyticsRange.from + 'T00:00:00');
    const end = new Date(analyticsRange.to + 'T00:00:00');
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];

    const monthKeys: string[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur.getTime() <= end.getTime()) {
      monthKeys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur.setMonth(cur.getMonth() + 1);
    }

    const paidByMonth = new Map<string, number>();
    for (const p of payments) {
      if (!p.paymentDate) continue;
      const dt = new Date(p.paymentDate + 'T00:00:00');
      if (!Number.isFinite(dt.getTime())) continue;
      if (dt.getTime() < start.getTime() || dt.getTime() > end.getTime()) continue;
      const key = toMonthKey(p.paymentDate);
      if (!key) continue;
      paidByMonth.set(key, (paidByMonth.get(key) ?? 0) + p.amount);
    }

    const inflowByMonth = new Map<string, number>();
    const overdueByMonth = new Map<string, number>();
    const today = new Date();
    const todayTs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    for (const inv of invoices) {
      if (inv.status !== 'unpaid') continue;
      if (!inv.dueDate) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(inv.dueDate)) continue;
      const dueTs = new Date(inv.dueDate + 'T00:00:00').getTime();
      if (!Number.isFinite(dueTs)) continue;
      const key = toMonthKey(inv.dueDate);
      if (!key) continue;

      if (dueTs >= start.getTime() && dueTs <= end.getTime()) {
        inflowByMonth.set(key, (inflowByMonth.get(key) ?? 0) + inv.amount);
      }
      if (dueTs < todayTs) {
        overdueByMonth.set(key, (overdueByMonth.get(key) ?? 0) + inv.amount);
      }
    }

    const toRuShortMonth = (monthKey: string) => {
      const [y, m] = monthKey.split('-');
      const idx = Number(m) - 1;
      if (!y || !Number.isFinite(idx) || idx < 0 || idx > 11) return monthKey;
      const date = new Date(Number(y), idx, 1);
      return new Intl.DateTimeFormat('ru-KZ', { month: 'short' }).format(date);
    };

    return monthKeys.map((mk) => ({
      monthKey: mk,
      monthLabel: toRuShortMonth(mk),
      paidRevenue: paidByMonth.get(mk) ?? 0,
      expectedInflow: inflowByMonth.get(mk) ?? 0,
      overdueExposure: overdueByMonth.get(mk) ?? 0,
    }));
  }, [analyticsRange.from, analyticsRange.to, invoices, payments]);

  const handleSeedDemo = () => {
    if (!companyId) return;
    seedDemoData(companyId);
    window.location.reload();
  };

  if (!session) return null;

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
    for (const cc of channelCampaigns) {
      m.set(cc.channelCampaignExternalId, cc.name);
    }
    return m;
  }, [channelCampaigns]);

  const recommendationItems = useMemo(
    () =>
      buildRecommendations({
        surface: 'executive',
        analytics,
        channelNameById,
        formatMoney: formatKZT,
        maxItems: 5,
      }),
    [analytics, channelNameById]
  );

  const funnelStageLabel = getStageLabel(analytics.insightSignals.funnelBottleneckStage);
  const topOverdue = analytics.insightSignals.topOverdueInvoices;
  const stalledDeals = analytics.salesCashPriority.stalledDeals;
  const overdueValue = analytics.overdueAmount.value;
  const overdueExplanation = useMemo(
    () => explainOverdue(overdueValue, analytics.expectedInflow.value),
    [overdueValue, analytics.expectedInflow.value]
  );

  const actionTypeLabel: Record<string, string> = {
    collect_overdue_invoice: 'Собрать просроченные оплаты',
    follow_up_unpaid_invoice: 'Напомнить по неоплаченным счетам',
    reengage_stalled_deal: 'Разморозить застрявшие сделки',
    prioritize_delayed_customer: 'Переопределить приоритет на клиентов с задержкой оплат',
  };

  const axisTick = buildAxisTick(chartTheme);
  const tooltipStyle = buildTooltipStyle(chartTheme);
  const legendStyle = buildLegendStyle(chartTheme);

  // Determine if there are critical issues to show
  const hasCriticalIssues = overdueValue > 0 || stalledDeals.length > 0 || analytics.salesCashPriority.delayedCustomers.length > 0;

  return (
    <AppLayout>
      <div className="rct-page p-4 lg:p-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="rct-page-title">Контроль выручки</h1>
            <p className="rct-body-micro mt-1">Проблемы, причины и приоритеты — на одном экране</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate('/marketing')}>
                Маркетинг
              </Button>
              <Button variant="outline" onClick={() => navigate('/sales-cash')}>
                Sales/Cash
              </Button>
            </div>
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">30 дней</SelectItem>
                <SelectItem value="90d">90 дней</SelectItem>
                <SelectItem value="180d">180 дней</SelectItem>
                <SelectItem value="all">Всё время</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Empty State */}
        {!hasAnyData && (
          <EmptyStateCard
            title="Нет данных"
            description="Нужна цепочка данных: маркетинг → лиды → сделки → счета → оплаты. Импортируйте файлы или нажмите «Демо-данные» — и дальше будет готовый walkthrough."
            imageUrl={EMPTY_CHART_URL}
            ctaLabel="Загрузить данные"
            onCta={() => navigate('/uploads')}
            secondaryCtaLabel="Демо-данные"
            onSecondaryCta={handleSeedDemo}
            className="text-center"
          />
        )}

        {hasAnyData && (
          <div className="rct-section-gap space-y-8">

            {/* Completeness bar — when partial data */}
            {completeness.overall < 100 && (
              <div className="rct-card-inset p-3 flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">Полнота данных:</span>
                {completeness.areas.map((a) => (
                  <Badge
                    key={a.area}
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      a.score >= 80 ? 'text-teal-600 dark:text-teal-400 border-teal-300/60' : a.score >= 50 ? 'text-amber-600 dark:text-amber-400 border-amber-300/60' : 'text-rose-600 dark:text-rose-400 border-rose-300/60'
                    )}
                  >
                    {a.label}: {a.score}%
                  </Badge>
                ))}
                <span className="text-[11px] text-muted-foreground">
                  Неполные данные могут влиять на точность расчётов. Загрузите недостающие сущности.
                </span>
              </div>
            )}

            {/* ============================================= */}
            {/* SECTION 1: CRITICAL ISSUES                    */}
            {/* Cash problems, unpaid invoices, risks         */}
            {/* ============================================= */}
            {hasCriticalIssues && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-5 w-5 text-rose-500" />
                  <h2 className="text-lg font-bold text-foreground">Критические проблемы</h2>
                  <Badge variant="outline" className="text-xs text-rose-600 dark:text-rose-400 border-rose-300/60 dark:border-rose-800/40">
                    требуют внимания
                  </Badge>
                </div>

                {/* Critical KPI strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                  <ControlTowerKpiCard
                    title="Просрочено"
                    value={moneyOrDash(overdueValue)}
                    subtitle={overdueValue > 0 ? 'угроза притоку' : 'всё в норме'}
                    status={overdueValue > 0 ? 'danger' : 'success'}
                    detail={{
                      what: overdueExplanation.what,
                      why: overdueExplanation.why,
                    }}
                    sparkline={heroChartData.map((d) => d.overdueExposure)}
                  />
                  <ControlTowerKpiCard
                    title="Застрявшие сделки"
                    value={String(stalledDeals.length)}
                    subtitle="без активности"
                    status={stalledDeals.length > 0 ? 'warning' : 'success'}
                    detail={{
                      what: 'Сделки без движения — деньги зависают',
                      why: 'Каждая замершая сделка — потенциально потерянная выручка.',
                    }}
                  />
                  <ControlTowerKpiCard
                    title="Клиенты с задержкой"
                    value={String(analytics.salesCashPriority.delayedCustomers.length)}
                    subtitle="проблема с оплатой"
                    status={analytics.salesCashPriority.delayedCustomers.length > 0 ? 'warning' : 'success'}
                    detail={{
                      what: 'Клиенты, систематически задерживающие оплаты',
                      why: 'Повторяющаяся задержка требует изменения условий.',
                    }}
                  />
                  <ControlTowerKpiCard
                    title="Неоплаченные счета"
                    value={String(analytics.salesCashPriority.unpaidInvoices.length)}
                    subtitle="ожидают оплаты"
                    status={analytics.salesCashPriority.unpaidInvoices.length > 5 ? 'warning' : 'default'}
                    detail={{
                      what: 'Все неоплаченные счета в периоде',
                      why: 'Общий объём "денег на очереди".',
                    }}
                  />
                </div>

                {/* Top overdue invoices + delayed customers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="rct-card rct-card-padding-compact border-l-[3px] border-l-rose-400/70">
                    <SectionHeader title="Топ просрочки" helpKey="overdue_amount" size="sm" />
                    <div className="mt-3 space-y-2">
                      {topOverdue.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Просрочки нет — отлично.</p>
                      ) : (
                        topOverdue.slice(0, 5).map((x) => (
                          <div key={x.invoiceExternalId ?? `${x.customerExternalId}_${x.dueDate ?? 'x'}`} className="rct-card-inset p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-medium text-foreground truncate max-w-[160px]">
                                {x.invoiceExternalId ?? x.customerExternalId ?? 'Счёт'}
                              </span>
                              <span className="text-xs font-semibold text-foreground whitespace-nowrap">{formatKZT(x.overdueAmount)}</span>
                            </div>
                            {x.dueDate ? (
                              <p className="text-[11px] text-muted-foreground mt-1">
                                срок: {new Date(x.dueDate + 'T00:00:00').toLocaleDateString('ru-KZ')}
                              </p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rct-card rct-card-padding-compact border-l-[3px] border-l-amber-400/70">
                    <SectionHeader title="Клиенты с задержкой" size="sm" />
                    <div className="mt-3 space-y-2">
                      {analytics.salesCashPriority.delayedCustomers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Нет клиентов с задержкой.</p>
                      ) : (
                        (() => {
                          const top = analytics.salesCashPriority.delayedCustomers
                            .slice()
                            .sort((a, b) => b.overdueAmount - a.overdueAmount)
                            .slice(0, 5);
                          const max = Math.max(1, ...top.map((c) => c.overdueAmount));
                          return top.map((c) => (
                            <RankedListItem
                              key={c.customerExternalId}
                              label={c.customerExternalId}
                              sublabel={`${c.overdueInvoiceCount} просроч. счетов`}
                              value={formatKZT(c.overdueAmount)}
                              progressPct={Math.round((c.overdueAmount / max) * 100)}
                              barColor="amber"
                            />
                          ));
                        })()
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ============================================= */}
            {/* SECTION 2: BOTTLENECKS                        */}
            {/* Conversion drops, stuck deals                 */}
            {/* ============================================= */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-bold text-foreground">Узкие места</h2>
                <Badge variant="outline" className="text-xs">
                  {funnelStageLabel}
                </Badge>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Funnel conversion */}
                <div className="lg:col-span-5 rct-card rct-card-padding">
                  <SectionHeader title="Воронка" helpKey="funnel_drop_off" size="sm" />
                  <div className="mt-4 space-y-3">
                    {[
                      { label: 'Лиды', value: analytics.funnelDropOff.leads, note: `→ ${percentFromRatio(analytics.funnelDropOff.leadToDealRate)}` },
                      { label: 'Сделки', value: analytics.funnelDropOff.deals, note: `→ ${percentFromRatio(analytics.funnelDropOff.dealToWonRate)}` },
                      { label: 'Выигранные', value: analytics.funnelDropOff.wonDeals, note: `→ ${percentFromRatio(analytics.funnelDropOff.wonToPaidRate)}` },
                      { label: 'Оплачено', value: analytics.funnelDropOff.paidWonDeals, note: '' },
                    ].map((s, idx, arr) => {
                      const max = Math.max(1, arr[0].value, arr[1].value, arr[2].value, arr[3].value);
                      const w = Math.round((s.value / max) * 100);
                      return (
                        <div key={s.label} className="space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                            <span className="text-xs text-foreground font-semibold">{s.value}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full',
                                idx === 0 ? 'bg-foreground/80' : idx === 1 ? 'bg-primary/70' : idx === 2 ? 'bg-teal-600/70 dark:bg-teal-500/60' : 'bg-teal-500/70 dark:bg-teal-400/60',
                              )}
                              style={{ width: `${w}%` }}
                            />
                          </div>
                          {s.note ? <p className="text-[11px] text-muted-foreground">Конверсия: {s.note}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bottleneck detail + worst sources */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="rct-card-raised rct-card-padding">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <SectionHeader title="Главный bottleneck" size="sm" />
                      <Badge variant="outline" className="text-xs text-rose-600 dark:text-rose-400 border-rose-300/60 dark:border-rose-800/40">
                        {funnelStageLabel}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rct-card-inset p-3 text-center">
                        <div className="text-[10px] text-muted-foreground">Лид→Сделка</div>
                        <div className="text-sm font-bold text-foreground mt-0.5">{percentFromRatio(analytics.leadToDealConversion.value)}</div>
                      </div>
                      <div className="rct-card-inset p-3 text-center">
                        <div className="text-[10px] text-muted-foreground">Сделка→Оплата</div>
                        <div className="text-sm font-bold text-foreground mt-0.5">{percentFromRatio(analytics.dealToPaidConversion.value)}</div>
                      </div>
                      <div className="rct-card-inset p-3 text-center">
                        <div className="text-[10px] text-muted-foreground">Просрочка</div>
                        <div className="text-sm font-bold text-foreground mt-0.5">{formatKZT(overdueValue)}</div>
                      </div>
                    </div>
                    {analytics.insightSignals.worstChannels[0] ? (
                      <p className="text-xs text-muted-foreground mt-3">
                        Источник-проблема: <span className="font-medium text-foreground">{channelNameById.get(analytics.insightSignals.worstChannels[0].channelCampaignExternalId) ?? analytics.insightSignals.worstChannels[0].channelCampaignExternalId}</span>
                      </p>
                    ) : null}
                  </div>

                  {/* Leakage overview — funnel-wide */}
                  {leakage.totalItems > 0 && (
                    <div className="rct-card rct-card-padding border-l-[3px] border-l-amber-400/70">
                      <SectionHeader title="Утечки воронки" size="sm" description={explainLeakage(leakage).why} />
                      <div className="mt-3 space-y-2">
                        {leakage.byCategory.slice(0, 4).map((c) => (
                          <div key={c.category} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-muted-foreground">{c.label}</span>
                            <span className="font-medium">{c.count} · {formatKZT(c.estimatedLoss)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <CollapsibleSection
                    title="Где больше всего провала"
                    summary={`${funnelStageLabel}`}
                    badge={<Badge variant="outline" className="text-xs">Причины</Badge>}
                    defaultOpen={false}
                  >
                    <div className="space-y-3">
                      {(() => {
                        const rowsById = new Map(analytics.paidRevenueBySource.rows.map((r) => [r.channelCampaignExternalId, r]));
                        const ids = [
                          ...analytics.bestWorstChannelsSummary.worstByLeadToDealConversion.slice(0, 2),
                          ...analytics.bestWorstChannelsSummary.worstByDealToPaidConversion.slice(0, 2),
                        ];
                        const unique = Array.from(new Set(ids));
                        if (unique.length === 0) return <p className="text-sm text-muted-foreground">Недостаточно данных</p>;
                        return unique.slice(0, 4).map((id) => {
                          const r = rowsById.get(id);
                          const label = channelNameById.get(id) ?? id;
                          const leadRate = r ? r.leadToDealConversion : 0;
                          const dealRate = r ? r.dealToPaidConversion : 0;
                          const worstMetric = Math.min(leadRate, dealRate);
                          return (
                            <div key={id} className="rct-card-inset p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">{label}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Лид→сделка {percentFromRatio(leadRate)} / Сделка→оплата {percentFromRatio(dealRate)}
                                  </p>
                                </div>
                                <Badge variant="outline" className="text-xs text-rose-600 dark:text-rose-400 border-rose-300/60 dark:border-rose-800/40 whitespace-nowrap">
                                  {percentFromRatio(worstMetric)}
                                </Badge>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </CollapsibleSection>
                </div>
              </div>
            </section>

            {/* ============================================= */}
            {/* SECTION 3: PERFORMANCE DRIVERS                */}
            {/* Marketing, revenue sources, money trend       */}
            {/* ============================================= */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-bold text-foreground">Драйверы выручки</h2>
              </div>

              {/* KPI Cards — Signal zone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                <ControlTowerKpiCard
                  title="Выручка"
                  value={moneyOrDash(analytics.revenue.value)}
                  subtitle="оплачено в периоде"
                  delta={makeGrowthDelta(analytics.growthRate.value)}
                  status={analytics.revenue.value > 0 ? 'success' : 'warning'}
                  detail={{
                    what: 'Суммарно оплачено за выбранный период',
                    why: 'Главный итог по деньгам — реальные поступления.',
                  }}
                  sparkline={heroChartData.map((d) => d.paidRevenue)}
                />
                <ControlTowerKpiCard
                  title="Ожидаемый приток"
                  value={moneyOrDash(analytics.expectedInflow.value)}
                  subtitle={calculationBadge(analytics.expectedInflow.calculationMode) ?? 'по срокам оплаты'}
                  status={analytics.expectedInflow.value > 0 ? 'success' : 'default'}
                  detail={{
                    what: 'Деньги, ожидаемые по неоплаченным счетам',
                    why: 'Будущий приток — основа для планирования кассы.',
                  }}
                  sparkline={heroChartData.map((d) => d.expectedInflow)}
                />
                <ControlTowerKpiCard
                  title="Лид → сделка"
                  value={percentFromRatio(analytics.leadToDealConversion.value)}
                  subtitle={calculationBadge(analytics.leadToDealConversion.calculationMode) ?? 'воронка лидов'}
                  status={analytics.leadToDealConversion.value >= 0.18 ? 'success' : 'warning'}
                  detail={{
                    what: 'Доля лидов, превращённых в сделки',
                    why: 'Показывает качество лидов и эффективность первого контакта.',
                  }}
                />
                <ControlTowerKpiCard
                  title="Рост выручки"
                  value={formatGrowth(analytics.growthRate.value)}
                  subtitle="к прошлому периоду"
                  delta={makeGrowthDelta(analytics.growthRate.value)}
                  status={analytics.growthRate.value !== null && analytics.growthRate.value >= 0 ? 'success' : 'danger'}
                  detail={{
                    what: 'Изменение выручки по сравнению с прошлым периодом',
                    why: 'Быстрая проверка: ускоряется ли бизнес или замедляется.',
                  }}
                />
              </div>

              {/* Money trend chart + revenue by source */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-8">
                  <div className="rct-hero-card rct-card-padding">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <SectionHeader
                        title="Тренд по деньгам"
                        description="Оплачено, ожидаемый приток и просрочки."
                      />
                      <Badge variant="outline" className="text-xs shrink-0">
                        {heroChartData.length ? `${heroChartData[0].monthLabel} → ${heroChartData[heroChartData.length - 1].monthLabel}` : 'Нет данных'}
                      </Badge>
                    </div>

                    <div className="h-[250px]">
                      {heroChartData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                          Недостаточно данных для тренда
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={heroChartData} margin={CHART_MARGIN}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                            <XAxis dataKey="monthLabel" tick={axisTick} axisLine={false} />
                            <YAxis
                              tick={axisTick}
                              tickFormatter={(v) => {
                                if (!Number.isFinite(v)) return '—';
                                const num = Number(v);
                                return num >= 1_000_000 ? `${Math.round(num / 1_000_000)}M` : new Intl.NumberFormat('ru-KZ').format(num);
                              }}
                            />
                            <RechartsTooltip
                              contentStyle={tooltipStyle.contentStyle}
                              wrapperStyle={tooltipStyle.wrapperStyle}
                              formatter={(value: unknown) => {
                                if (!Number.isFinite(Number(value))) return '—';
                                return formatKZT(Number(value));
                              }}
                            />
                            <Legend wrapperStyle={legendStyle.wrapperStyle} iconSize={legendStyle.iconSize} />
                            <Line type="monotone" dataKey="paidRevenue" name="Оплачено" stroke={CHART_COLORS.paid} strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="expectedInflow" name="Ожидаемый приток" stroke={CHART_COLORS.expected} strokeWidth={2} dot={false} />
                            <Line
                              type="monotone"
                              dataKey="overdueExposure"
                              name="Просрочка"
                              stroke={CHART_COLORS.overdue}
                              strokeWidth={2}
                              dot={false}
                              strokeDasharray="6 4"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>

                {/* Revenue by source */}
                <div className="xl:col-span-4 space-y-4">
                  <div className="rct-card rct-card-padding">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <SectionHeader title="Деньги по источникам" helpKey="paid_revenue_by_source" size="sm" />
                      <div className="flex items-center gap-2 shrink-0">
                        {analytics.paidRevenueBySource.coverage.paidAttribution.fallback > 0 && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-300/60">По неполным связям</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">{analytics.paidRevenueBySource.rows.length}</Badge>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {(() => {
                        const rows = analytics.paidRevenueBySource.rows.slice().sort((a, b) => b.paidRevenue - a.paidRevenue).slice(0, 5);
                        if (rows.length === 0) {
                          return <p className="rct-body-micro">Нет данных для атрибуции</p>;
                        }
                        const max = Math.max(1, ...rows.map((r) => r.paidRevenue));
                        return rows.map((r) => (
                          <RankedListItem
                            key={r.channelCampaignExternalId}
                            label={channelNameById.get(r.channelCampaignExternalId) ?? r.channelCampaignExternalId}
                            value={formatKZT(r.paidRevenue)}
                            progressPct={Math.round((r.paidRevenue / max) * 100)}
                            barColor="emerald"
                          />
                        ));
                      })()}
                    </div>
                    {analytics.paidRevenueBySource.unattributedPaidRevenue > 0 ? (
                      <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">
                        Не размечено: {formatKZT(analytics.paidRevenueBySource.unattributedPaidRevenue)}
                      </p>
                    ) : null}
                  </div>

                  {/* Best sources */}
                  <div className="rct-card rct-card-padding-compact">
                    <SectionHeader title="Лучшие по деньгам" size="sm" />
                    <div className="mt-3 space-y-2">
                      {(() => {
                        const rows = analytics.paidRevenueBySource.rows
                          .slice()
                          .sort((a, b) => b.paidRevenue - a.paidRevenue)
                          .slice(0, 3);
                        if (rows.length === 0) return <p className="rct-body-micro">Нет данных</p>;
                        const max = Math.max(1, ...rows.map((r) => r.paidRevenue));
                        return rows.map((r) => (
                          <RankedListItem
                            key={r.channelCampaignExternalId}
                            label={channelNameById.get(r.channelCampaignExternalId) ?? r.channelCampaignExternalId}
                            value={formatKZT(r.paidRevenue)}
                            progressPct={Math.round((r.paidRevenue / max) * 100)}
                            barColor="emerald"
                          />
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ============================================= */}
            {/* SECTION 4: RECOMMENDATIONS (at the very bottom) */}
            {/* ============================================= */}
            <section>
              <RecommendationsCard
                title="Рекомендации"
                description="Что не так, почему важно и что сделать дальше."
                items={recommendationItems}
                helpKey="priority_actions"
                compact
              />

              {/* Priority actions */}
              <CollapsibleSection
                title="Приоритетные действия"
                summary={`${analytics.salesCashPriority.priorityActionCandidates.length} кандидатов`}
                defaultOpen={analytics.salesCashPriority.priorityActionCandidates.length > 0}
              >
                <div className="space-y-2">
                  {analytics.salesCashPriority.priorityActionCandidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет кандидатов.</p>
                  ) : (
                    analytics.salesCashPriority.priorityActionCandidates.slice(0, 5).map((a) => (
                      <div key={a.id} className="rct-card-inset p-3">
                        <p className="text-sm font-semibold text-foreground truncate">{actionTypeLabel[a.type] ?? a.type}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {a.area === 'cashflow' ? 'cash' : a.area === 'sales' ? 'sales' : 'revenue'}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px]',
                              a.priority === 'high'
                                ? 'text-rose-600 dark:text-rose-400 border-rose-300/60 dark:border-rose-800/40'
                                : a.priority === 'medium'
                                  ? 'text-yellow-700 dark:text-yellow-400 border-yellow-300/60 dark:border-yellow-800/40'
                                  : 'text-primary border-primary/30'
                            )}
                          >
                            {a.priority === 'high' ? 'Высокий' : a.priority === 'medium' ? 'Средний' : 'Низкий'}
                          </Badge>
                        </div>
                        {a.facts[0] ? (
                          <p className="text-xs text-muted-foreground mt-1.5">{a.facts[0]}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </CollapsibleSection>
            </section>

          </div>
        )}
      </div>
    </AppLayout>
  );
}
