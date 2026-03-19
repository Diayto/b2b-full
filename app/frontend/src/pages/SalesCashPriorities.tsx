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
  computeUnifiedFunnel,
  computeLeakageAnalysis,
  computeLostDealsAnalysis,
  computeSystemCompleteness,
  LOST_REASON_LABELS,
  FUNNEL_STAGE_LABELS,
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

  // --- Lost Deals Analysis (shared analytics) ---
  const lostDealsAnalysis = useMemo(
    () => computeLostDealsAnalysis(deals, managers),
    [deals, managers]
  );

  // --- Model, Leakage, Lower Funnel (shared analytics) ---
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

  const leakage = useMemo(
    () =>
      computeLeakageAnalysis({
        model,
        contentMetrics: contentMetrics.length > 0 ? contentMetrics : undefined,
      }),
    [model, contentMetrics]
  );

  const lowerFunnelStageData = useMemo(() => {
    const wonDeals = deals.filter((d) => d.status === 'won');
    const invoicedCount = invoices.filter((inv) => {
      if (!inv.dealExternalId) return false;
      const deal = model.dealByExternalId.get(inv.dealExternalId);
      return deal?.status === 'won';
    }).length;
    const paidInPeriod = payments.filter(
      (p) => p.paymentDate && p.amount > 0
    ).length;
    return {
      deal: deals.length,
      won: wonDeals.length,
      invoiced: invoicedCount,
      paid: analytics.funnelDropOff.paidWonDeals,
    };
  }, [deals, invoices, model.dealByExternalId, payments, analytics.funnelDropOff.paidWonDeals]);

  const overdueInvoicesCount = analytics.salesCashPriority.overdueInvoices.length;
  const unpaidInvoicesCount = analytics.salesCashPriority.unpaidInvoices.length;

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
                value={String(analytics.salesCashPriority.stalledDeals.length)}
                subtitle="без активности"
                status={analytics.salesCashPriority.stalledDeals.length > 0 ? 'warning' : 'success'}
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
                value={formatKZT(analytics.overdueAmount.value)}
                subtitle={`${overdueInvoicesCount} счет(ов)`}
                status={overdueInvoicesCount > 0 ? 'danger' : 'success'}
                icon={<AlertTriangle className="h-5 w-5" />}
              />
              <ControlTowerKpiCard
                title="Клиенты с задержкой"
                value={String(analytics.salesCashPriority.delayedCustomers.length)}
                subtitle="с проблемой оплаты"
                status={analytics.salesCashPriority.delayedCustomers.length > 0 ? 'warning' : 'default'}
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
                  <CardDescription>Где теряются сделки между выигрышем и поступлением денег</CardDescription>
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
                  <CardDescription>Где теряется потенциальная выручка</CardDescription>
                </CardHeader>
                <CardContent>
                  {leakage.totalItems === 0 ? (
                    <p className="text-sm text-muted-foreground">Утечек не обнаружено — воронка в норме.</p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Всего: {leakage.totalItems} точек · ~{formatKZT(leakage.totalEstimatedLoss)} потерь
                      </p>
                      {leakage.byCategory.slice(0, 5).map((c) => (
                        <div key={c.category} className="flex items-center justify-between gap-3 rct-card-inset p-2.5">
                          <span className="text-xs font-medium text-foreground">{c.label}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{c.count}</Badge>
                            <span className="text-xs font-semibold text-foreground">{formatKZT(c.estimatedLoss)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Left: Deals + Invoices */}
              <div className="space-y-6 xl:col-span-2">
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
                      <div className="space-y-5">
                        {/* Top reasons aggregation */}
                        <div className="rct-card-inset p-4">
                          <p className="text-sm font-semibold text-foreground mb-3">Причины потерь</p>
                          <div className="space-y-2.5">
                            {lostDealsAnalysis.reasonBreakdown.map((r) => {
                              const maxPct = Math.max(1, ...lostDealsAnalysis.reasonBreakdown.map((x) => x.percentage));
                              const w = Math.round((r.percentage / maxPct) * 100);
                              return (
                                <div key={r.reason} className="space-y-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-medium text-foreground">{r.label}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {r.count} ({r.percentage.toFixed(0)}%)
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

                        {/* Lost by manager */}
                        {lostDealsAnalysis.managerBreakdown.length > 0 && (
                          <div className="rct-card-inset p-4">
                            <p className="text-sm font-semibold text-foreground mb-3">По менеджерам</p>
                            <div className="space-y-2">
                              {lostDealsAnalysis.managerBreakdown.slice(0, 5).map((m) => {
                                const max = Math.max(1, ...lostDealsAnalysis.managerBreakdown.map((x) => x.lostCount));
                                return (
                                  <RankedListItem
                                    key={m.managerName}
                                    label={m.managerName}
                                    value={`${m.lostCount} потерь`}
                                    progressPct={Math.round((m.lostCount / max) * 100)}
                                    barColor="rose"
                                  />
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Lost deals list */}
                        <div>
                          <p className="text-sm font-semibold text-foreground mb-3">Список потерянных сделок</p>
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
                                {lostDealsAnalysis.deals.slice(0, 15).map((d) => (
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
                                        {LOST_REASON_LABELS[d.lostReason as LostReason] ?? d.lostReason}
                                      </Badge>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[100px]">{d.managerName}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{formatDateRu(d.lostDate)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {lostDealsAnalysis.total > 15 && (
                            <p className="text-xs text-muted-foreground mt-2">Показаны первые 15 из {lostDealsAnalysis.total}.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Stalled deals */}
                <Card className="rct-card">
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
                    {analytics.salesCashPriority.stalledDeals.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Нет застрявших сделок.</p>
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
                        const normalized = analytics.salesCashPriority.stalledDeals.map((d) => {
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
                <Card className="rct-card">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      Неоплаченные и просроченные счета
                      <MetricHelpIcon helpKey="risk_flags" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      const overdueInvoices = analytics.salesCashPriority.overdueInvoices;
                      const unpaidInvoices = analytics.salesCashPriority.unpaidInvoices;
                      const delayedCustomers = analytics.salesCashPriority.delayedCustomers;

                      const overdueTotal = overdueInvoices.reduce((s, x) => s + x.overdueAmount, 0);
                      const unpaidTotal = unpaidInvoices.reduce((s, x) => s + x.outstanding, 0);
                      const delayedTotal = delayedCustomers.reduce((s, x) => s + x.overdueAmount, 0);
                      const nonOverdueUnpaid = Math.max(0, unpaidTotal - overdueTotal);

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
                <Card className="rct-card">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      Клиенты с задержкой
                      <MetricHelpIcon helpKey="delayed_customers" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.salesCashPriority.delayedCustomers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Нет клиентов с задержкой.</p>
                    ) : (
                      (() => {
                        const top = analytics.salesCashPriority.delayedCustomers
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

                {/* Priority actions */}
                <Card className="rct-card">
                  <CardHeader className="rct-card-padding pb-2">
                    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                      Приоритетные действия
                      <MetricHelpIcon helpKey="priority_actions" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.salesCashPriority.priorityActionCandidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Нет кандидатов.</p>
                    ) : (
                      <div className="space-y-3">
                        {analytics.salesCashPriority.priorityActionCandidates.slice(0, 5).map((a) => (
                          <div key={a.id} className="rct-card-inset p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">
                                  {actionTypeLabelMap[a.type] ?? a.type}
                                </p>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                  <Badge variant="outline" className="text-[10px]">
                                    {a.area === 'cashflow' ? 'cash' : a.area === 'sales' ? 'sales' : 'revenue'}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-[10px]',
                                      a.priority === 'high'
                                        ? 'text-rose-600 dark:text-rose-400 border-rose-300/60'
                                        : a.priority === 'medium'
                                          ? 'text-yellow-700 dark:text-yellow-400 border-yellow-300/60'
                                          : 'text-primary border-primary/30'
                                    )}
                                  >
                                    {a.priority === 'high' ? 'Высокий' : a.priority === 'medium' ? 'Средний' : 'Низкий'}
                                  </Badge>
                                </div>
                              </div>
                              <Bolt className="h-4 w-4 text-primary mt-0.5" />
                            </div>
                            {a.facts[0] && (
                              <p className="text-xs text-muted-foreground mt-2">{a.facts[0]}</p>
                            )}
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
